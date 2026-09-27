package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func lifecycleIssueFixture(t *testing.T, sqlDB *sql.DB) (int64, int64, string) {
	t.Helper()
	ctx := context.Background()
	var siteID int64
	if err := sqlDB.QueryRowContext(ctx, `SELECT id FROM sites ORDER BY id LIMIT 1`).Scan(&siteID); err != nil {
		t.Fatalf("site fixture: %v", err)
	}
	locationCode := fmt.Sprintf("LIFECYCLE_%d", time.Now().UnixNano())
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO locations (code, name_vi, name_zh, name_en, qr_code, site_id) VALUES ($1, 'Lifecycle', 'Lifecycle', 'Lifecycle', $2, $3)`, locationCode, locationCode, siteID); err != nil {
		t.Fatalf("location fixture: %v", err)
	}
	var userID int64
	username := fmt.Sprintf("lifecycle-%d", time.Now().UnixNano())
	if err := sqlDB.QueryRowContext(ctx, `INSERT INTO users (username, full_name, role, site_id) VALUES ($1, 'Lifecycle Admin', 'ADMIN', $2) RETURNING id`, username, siteID).Scan(&userID); err != nil {
		t.Fatalf("user fixture: %v", err)
	}
	var issueID int64
	clientUUID := fmt.Sprintf("00000000-0000-4000-8000-%012d", time.Now().UnixNano()%1000000000000)
	if err := sqlDB.QueryRowContext(ctx, `INSERT INTO issues (client_uuid, creator_id, category, location_code, photo_before, site_id, visibility_class) VALUES ($1, $2, '3S', $3, 'before.jpg', $4, 'SITE_PUBLIC') RETURNING id`, clientUUID, userID, locationCode, siteID).Scan(&issueID); err != nil {
		t.Fatalf("issue fixture: %v", err)
	}
	return issueID, userID, locationCode
}

func TestPostgresDeleteRestorePreservesAuditMetadataAndScoreLedger(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	ctx := context.Background()
	issueID, adminID, locationCode := lifecycleIssueFixture(t, sqlDB)
	queries := New(sqlDB)
	createdAt := time.Date(2025, time.December, 31, 4, 5, 6, 0, time.UTC)
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO score_logs (issue_id, target_type, target_id, rule_key, points, created_at, penalty_date) VALUES ($1, 'LOCATION', $2, 'reward_old', 7, $3, NULL), ($1, 'LOCATION', $2, 'penalty_old', -4, $3, $4), ($1, 'USER', $5::text, 'retro_old', 3, $6, NULL)`, issueID, locationCode, createdAt, createdAt.UTC().Format("2006-01-02"), strconv.FormatInt(adminID, 10), createdAt.Add(time.Hour)); err != nil {
		t.Fatalf("score fixture: %v", err)
	}
	if _, err := sqlDB.ExecContext(ctx, `INSERT INTO notification_outbox (issue_id, event_type, channel, payload, status) VALUES ($1, 'ISSUE_CREATED', 'TEST', '{}'::jsonb, 'PENDING'), ($1, 'ISSUE_CREATED', 'TEST', '{}'::jsonb, 'SENDING'), ($1, 'ISSUE_CREATED', 'TEST', '{}'::jsonb, 'SENT')`, issueID); err != nil {
		t.Fatalf("outbox fixture: %v", err)
	}
	var issue struct {
		Version int32
		Status  string
	}
	if err := sqlDB.QueryRowContext(ctx, `SELECT version, status FROM issues WHERE id = $1`, issueID).Scan(&issue.Version, &issue.Status); err != nil {
		t.Fatalf("read initial issue state: %v", err)
	}
	beforeVersion := issue.Version
	beforeStatus := issue.Status
	deleted, err := queries.DeleteIssueAtomic(ctx, SoftDeleteIssueParams{ID: issueID, DeletedBy: sql.NullInt64{Int64: adminID, Valid: true}, DeleteReason: sql.NullString{String: "duplicate issue", Valid: true}, Version: beforeVersion}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: "ISSUE_DELETE", TargetTable: "issues", TargetID: fmt.Sprint(issueID)})
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !deleted.DeletedAt.Valid || deleted.Version != beforeVersion+1 {
		t.Fatalf("unexpected delete: %+v", deleted)
	}
	var pending, sending, sent int
	if err := sqlDB.QueryRowContext(ctx, `SELECT COUNT(*) FILTER (WHERE status = 'CANCELLED'), COUNT(*) FILTER (WHERE status = 'SENDING'), COUNT(*) FILTER (WHERE status = 'SENT') FROM notification_outbox WHERE issue_id = $1`, issueID).Scan(&pending, &sending, &sent); err != nil {
		t.Fatalf("outbox state: %v", err)
	}
	if pending != 2 || sending != 0 || sent != 1 {
		t.Fatalf("unexpected outbox cancellation counts: cancelled=%d sending=%d sent=%d", pending, sending, sent)
	}
	var oldValue, newValue []byte
	if err := sqlDB.QueryRowContext(ctx, `SELECT old_value, new_value FROM system_audit_logs WHERE action = 'ISSUE_DELETE' AND target_id = $1 ORDER BY id DESC LIMIT 1`, fmt.Sprint(issueID)).Scan(&oldValue, &newValue); err != nil {
		t.Fatalf("delete audit: %v", err)
	}
	var oldMap, newMap map[string]any
	if err := json.Unmarshal(oldValue, &oldMap); err != nil {
		t.Fatalf("decode delete old metadata: %v", err)
	}
	if err := json.Unmarshal(newValue, &newMap); err != nil {
		t.Fatalf("decode delete new metadata: %v", err)
	}
	if oldMap["status"] != beforeStatus || oldMap["version"] != float64(beforeVersion) || newMap["status"] != beforeStatus || newMap["version"] != float64(beforeVersion+1) || newMap["deleted_by"] != float64(adminID) || newMap["delete_reason"] != "duplicate issue" {
		t.Fatalf("audit metadata lost actual transition: old=%v new=%v", oldMap, newMap)
	}
	if got, err := queries.ListScoreLogsByIssueIncludingDeleted(ctx, issueID); err != nil || len(got) != 3 {
		t.Fatalf("deleted issue ledger changed: rows=%d err=%v", len(got), err)
	}
	if got, err := queries.GetLocationScoreSumInWeek(ctx, GetLocationScoreSumInWeekParams{TargetID: locationCode, CreatedAt: createdAt.Add(-time.Hour)}); err != nil || got != 0 {
		t.Fatalf("deleted issue still contributes score: sum=%d err=%v", got, err)
	}

	restored, err := queries.RestoreIssueAtomic(ctx, RestoreIssueParams{ID: issueID, Version: deleted.Version}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: "ISSUE_RESTORE", TargetTable: "issues", TargetID: fmt.Sprint(issueID)})
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if restored.DeletedAt.Valid || restored.Version != deleted.Version+1 {
		t.Fatalf("unexpected restore: %+v", restored)
	}
	if got, err := queries.GetLocationScoreSumInWeek(ctx, GetLocationScoreSumInWeekParams{TargetID: locationCode, CreatedAt: createdAt.Add(-time.Hour)}); err != nil || got != 3 {
		t.Fatalf("restored ledger did not use original dates: sum=%d err=%v", got, err)
	}
	var restoreOld, restoreNew []byte
	if err := sqlDB.QueryRowContext(ctx, `SELECT old_value, new_value FROM system_audit_logs WHERE action = 'ISSUE_RESTORE' AND target_id = $1 ORDER BY id DESC LIMIT 1`, fmt.Sprint(issueID)).Scan(&restoreOld, &restoreNew); err != nil {
		t.Fatalf("restore audit: %v", err)
	}
	var restoreOldMap, restoreNewMap map[string]any
	if err := json.Unmarshal(restoreOld, &restoreOldMap); err != nil {
		t.Fatalf("decode restore old metadata: %v", err)
	}
	if err := json.Unmarshal(restoreNew, &restoreNewMap); err != nil {
		t.Fatalf("decode restore new metadata: %v", err)
	}
	if restoreOldMap["version"] != float64(deleted.Version) || restoreNewMap["version"] != float64(restored.Version) {
		t.Fatalf("restore audit missing actual versions: old=%v new=%v", restoreOldMap, restoreNewMap)
	}
}

func TestPostgresDeleteRestoreAuditFailureRollsBackMetadata(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	ctx := context.Background()
	issueID, adminID, _ := lifecycleIssueFixture(t, sqlDB)
	queries := New(sqlDB)
	var version int32
	if err := sqlDB.QueryRowContext(ctx, `SELECT version FROM issues WHERE id = $1`, issueID).Scan(&version); err != nil {
		t.Fatal(err)
	}
	_, err := queries.DeleteIssueAtomic(ctx, SoftDeleteIssueParams{ID: issueID, DeletedBy: sql.NullInt64{Int64: adminID, Valid: true}, DeleteReason: sql.NullString{String: "rollback", Valid: true}, Version: version}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: strings.Repeat("x", 101), TargetTable: "issues", TargetID: fmt.Sprint(issueID)})
	if err == nil {
		t.Fatal("expected audit failure")
	}
	var deletedAt sql.NullTime
	var gotVersion int32
	if err := sqlDB.QueryRowContext(ctx, `SELECT version, deleted_at FROM issues WHERE id = $1`, issueID).Scan(&gotVersion, &deletedAt); err != nil {
		t.Fatal(err)
	}
	if gotVersion != version || deletedAt.Valid {
		t.Fatalf("delete metadata committed despite audit failure: version=%d deleted=%v", gotVersion, deletedAt.Valid)
	}
}

func TestPostgresConcurrentDeleteUsesOneVersionAndOneAudit(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	ctx := context.Background()
	issueID, adminID, _ := lifecycleIssueFixture(t, sqlDB)
	queries := New(sqlDB)
	var version int32
	if err := sqlDB.QueryRowContext(ctx, `SELECT version FROM issues WHERE id = $1`, issueID).Scan(&version); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, errs[i] = queries.DeleteIssueAtomic(ctx, SoftDeleteIssueParams{ID: issueID, DeletedBy: sql.NullInt64{Int64: adminID, Valid: true}, DeleteReason: sql.NullString{String: "race", Valid: true}, Version: version}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: "ISSUE_DELETE", TargetTable: "issues", TargetID: fmt.Sprint(issueID)})
		}(i)
	}
	close(start)
	wg.Wait()
	successes := 0
	for _, err := range errs {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("expected exactly one concurrent delete success, got %d errors=%v", successes, errs)
	}
	var audits int
	if err := sqlDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM system_audit_logs WHERE action = 'ISSUE_DELETE' AND target_id = $1`, fmt.Sprint(issueID)).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 1 {
		t.Fatalf("expected one delete audit after race, got %d", audits)
	}
}

func TestPostgresScoreInsertAfterDeleteIsRejected(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	ctx := context.Background()
	issueID, adminID, locationCode := lifecycleIssueFixture(t, sqlDB)
	queries := New(sqlDB)
	var version int32
	if err := sqlDB.QueryRowContext(ctx, `SELECT version FROM issues WHERE id = $1`, issueID).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.DeleteIssueAtomic(ctx, SoftDeleteIssueParams{ID: issueID, DeletedBy: sql.NullInt64{Int64: adminID, Valid: true}, DeleteReason: sql.NullString{String: "stop scoring", Valid: true}, Version: version}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: "ISSUE_DELETE", TargetTable: "issues", TargetID: fmt.Sprint(issueID)}); err != nil {
		t.Fatal(err)
	}
	if err := queries.InsertScoreLog(ctx, InsertScoreLogParams{ID: issueID, TargetType: "LOCATION", TargetID: locationCode, RuleKey: "late", Points: -1}); err != nil {
		t.Fatalf("deleted score insert returned database error: %v", err)
	}
	var count int
	if err := sqlDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM score_logs WHERE issue_id = $1 AND rule_key = 'late'`, issueID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("score insert created %d row(s) for deleted issue", count)
	}
}

func TestPostgresConcurrentCloseAndDeleteKeepsLifecycleAtomic(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	ctx := context.Background()
	issueID, adminID, locationCode := lifecycleIssueFixture(t, sqlDB)
	if _, err := sqlDB.ExecContext(ctx, `UPDATE issues SET status = 'PENDING_REVIEW' WHERE id = $1`, issueID); err != nil {
		t.Fatal(err)
	}
	queries := New(sqlDB)
	var version int32
	var initialStatus string
	if err := sqlDB.QueryRowContext(ctx, `SELECT version, status FROM issues WHERE id = $1`, issueID).Scan(&version, &initialStatus); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	type result struct {
		closed, deleted bool
		status          string
		err             error
	}
	results := make(chan result, 2)
	go func() {
		<-start
		closed, err := queries.CloseIssueWithEffectsAtomic(ctx, CloseIssueParams{ID: issueID, ScoreRating: sql.NullInt16{Int16: 4, Valid: true}, ExpectedVersion: sql.NullInt32{Int32: version, Valid: true}}, []InsertScoreLogParams{{ID: issueID, TargetType: "LOCATION", TargetID: locationCode, RuleKey: "close_reward", Points: 5}}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: "CLOSE_ISSUE", TargetTable: "issues", TargetID: fmt.Sprint(issueID)})
		results <- result{closed: err == nil, status: closed.Status, err: err}
	}()
	go func() {
		<-start
		_, err := queries.DeleteIssueAtomic(ctx, SoftDeleteIssueParams{ID: issueID, DeletedBy: sql.NullInt64{Int64: adminID, Valid: true}, DeleteReason: sql.NullString{String: "concurrent removal", Valid: true}, Version: version}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: "ISSUE_DELETE", TargetTable: "issues", TargetID: fmt.Sprint(issueID)})
		results <- result{deleted: err == nil, err: err}
	}()
	close(start)
	first, second := <-results, <-results
	successes := 0
	var closedStatus string
	for _, outcome := range []result{first, second} {
		if outcome.err == nil {
			successes++
			if outcome.closed {
				closedStatus = outcome.status
			}
		}
	}
	if successes != 1 {
		t.Fatalf("expected one lifecycle winner, got %d: %+v / %+v", successes, first, second)
	}
	var status string
	var deletedAt sql.NullTime
	if err := sqlDB.QueryRowContext(ctx, `SELECT status, deleted_at FROM issues WHERE id = $1`, issueID).Scan(&status, &deletedAt); err != nil {
		t.Fatal(err)
	}
	var scoreCount int
	if err := sqlDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM score_logs WHERE issue_id = $1 AND rule_key = 'close_reward'`, issueID).Scan(&scoreCount); err != nil {
		t.Fatal(err)
	}
	if deletedAt.Valid {
		if status != initialStatus || scoreCount != 0 {
			t.Fatalf("delete won but close side effect leaked: status=%s scores=%d", status, scoreCount)
		}
	} else if status != closedStatus || closedStatus == initialStatus || scoreCount != 1 {
		t.Fatalf("close won without exactly one score: status=%s expected=%s scores=%d", status, closedStatus, scoreCount)
	}
}

func TestPostgresConcurrentScoreInsertAndDeleteDoesNotScoreDeletedIssue(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	ctx := context.Background()
	issueID, adminID, locationCode := lifecycleIssueFixture(t, sqlDB)
	queries := New(sqlDB)
	var version int32
	if err := sqlDB.QueryRowContext(ctx, `SELECT version FROM issues WHERE id = $1`, issueID).Scan(&version); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	var wg sync.WaitGroup
	var deleteErr, scoreErr error
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		_, deleteErr = queries.DeleteIssueAtomic(ctx, SoftDeleteIssueParams{ID: issueID, DeletedBy: sql.NullInt64{Int64: adminID, Valid: true}, DeleteReason: sql.NullString{String: "cron race", Valid: true}, Version: version}, InsertAuditLogParams{UserID: sql.NullInt64{Int64: adminID, Valid: true}, Action: "ISSUE_DELETE", TargetTable: "issues", TargetID: fmt.Sprint(issueID)})
	}()
	go func() {
		defer wg.Done()
		<-start
		scoreErr = queries.InsertScoreLog(ctx, InsertScoreLogParams{ID: issueID, TargetType: "LOCATION", TargetID: locationCode, RuleKey: "overdue", Points: -1})
	}()
	close(start)
	wg.Wait()
	if deleteErr != nil || scoreErr != nil {
		t.Fatalf("concurrent score/delete database errors: delete=%v score=%v", deleteErr, scoreErr)
	}
	var deleted bool
	if err := sqlDB.QueryRowContext(ctx, `SELECT deleted_at IS NOT NULL FROM issues WHERE id = $1`, issueID).Scan(&deleted); err != nil {
		t.Fatal(err)
	}
	if !deleted {
		t.Fatal("delete did not commit in score/delete race")
	}
	var rows int
	if err := sqlDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM score_logs WHERE issue_id = $1 AND rule_key = 'overdue'`, issueID).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows > 1 {
		t.Fatalf("concurrent score/delete inserted duplicate rows: %d", rows)
	}
	var activeSum int64
	if err := sqlDB.QueryRowContext(ctx, `SELECT COALESCE(SUM(sl.points), 0) FROM score_logs sl JOIN issues i ON i.id = sl.issue_id WHERE sl.issue_id = $1 AND i.deleted_at IS NULL`, issueID).Scan(&activeSum); err != nil {
		t.Fatal(err)
	}
	if activeSum != 0 {
		t.Fatalf("deleted issue contributed active score %d", activeSum)
	}
}
