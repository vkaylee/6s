package issue

import (
	"6s/internal/ai"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/storage"
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// seededPermissions mirrors migration 000009 defaults (SPEC.md 5.2 matrix).
func seededPermissions(role string) []string {
	switch role {
	case "USER":
		return []string{auth.PermissionIssueCreate, auth.PermissionIssueViewAll, auth.PermissionIssueResolve, auth.PermissionIssueCloseOwn, auth.PermissionIssueReopen}
	case "LINE_LEADER":
		return []string{auth.PermissionIssueCreate, auth.PermissionIssueViewAll, auth.PermissionIssueResolve, auth.PermissionIssueCloseOwn, auth.PermissionIssueCloseLine, auth.PermissionIssueReopen}
	case "SAFETY_OFFICER":
		return []string{auth.PermissionIssueCreate, auth.PermissionIssueViewAll, auth.PermissionIssueResolve, auth.PermissionIssueCloseAny, auth.PermissionIssueCloseSafety, auth.PermissionIssueReopen, auth.PermissionIssueInvalidate}
	case "ADMIN", "SUPERADMIN":
		return []string{auth.PermissionIssueCreate, auth.PermissionIssueViewAll, auth.PermissionIssueResolve, auth.PermissionIssueCloseOwn, auth.PermissionIssueCloseLine, auth.PermissionIssueCloseAny, auth.PermissionIssueCloseSafety, auth.PermissionIssueReopen, auth.PermissionIssueInvalidate, auth.PermissionScoringManage, auth.PermissionADManage, auth.PermissionUserManage, auth.PermissionManage, auth.PermissionMasterdataManage}
	default:
		return nil
	}
}

// ctxFor reproduces the middleware context for a seeded-role user.
func ctxFor(user db.User) context.Context {
	return auth.WithPermissions(context.WithValue(context.Background(), auth.UserContextKey, user), seededPermissions(user.Role))
}

type mockIssueStore struct {
	issues       map[int64]db.Issue
	locations    map[string]db.Location
	tags         map[int64][]string
	users        map[int64]db.User
	assets       map[int64]db.Asset
	teams        map[int64]db.Team
	memberships  map[int64]map[int64]struct{}
	history      map[int64][]db.ListIssueResponsibilityHistoryRow
	outbox       []db.CreateOutboxEntryParams
	scoreLogs    []db.InsertScoreLogParams
	auditLogs    []db.InsertAuditLogParams
	translations map[string]string
	rules        map[string]int32
	tagDeleteErr error
	tagInsertErr error
	auditErr     error
	lastList     db.ListIssuesFilteredParams
	lastCount    db.CountIssuesFilteredParams
	pendingTags  []db.UpsertProposedTagParams
}

func newMockIssueStore() *mockIssueStore {
	return &mockIssueStore{
		issues:       make(map[int64]db.Issue),
		locations:    make(map[string]db.Location),
		tags:         make(map[int64][]string),
		users:        make(map[int64]db.User),
		assets:       make(map[int64]db.Asset),
		teams:        make(map[int64]db.Team),
		memberships:  make(map[int64]map[int64]struct{}),
		history:      make(map[int64][]db.ListIssueResponsibilityHistoryRow),
		translations: make(map[string]string),
		rules:        make(map[string]int32),
	}
}

func (m *mockIssueStore) GetIssueByID(_ context.Context, id int64) (db.Issue, error) {
	iss, ok := m.issues[id]
	if !ok {
		return db.Issue{}, sql.ErrNoRows
	}
	return iss, nil
}
func (m *mockIssueStore) ListVisibleIssueEventRecipients(_ context.Context, arg db.ListVisibleIssueEventRecipientsParams) ([]int64, error) {
	// Test store default: return active subscriber IDs so workflow events remain observable.
	return append([]int64(nil), arg.UserIds...), nil
}

func (m *mockIssueStore) GetIssueByUUID(_ context.Context, clientUUID string) (db.Issue, error) {
	for _, iss := range m.issues {
		if iss.ClientUuid == clientUUID {
			return iss, nil
		}
	}
	return db.Issue{}, sql.ErrNoRows
}

func (m *mockIssueStore) CreateIssue(_ context.Context, arg db.CreateIssueParams) (db.Issue, error) {
	iss := db.Issue{
		ID:                         int64(len(m.issues) + 1),
		ClientUuid:                 arg.ClientUuid,
		Version:                    1,
		SiteID:                     arg.SiteID,
		CreatorID:                  arg.CreatorID,
		Category:                   arg.Category,
		CauseType:                  arg.CauseType,
		VisibilityClass:            arg.VisibilityClass,
		LocationCode:               arg.LocationCode,
		Description:                arg.Description,
		PhotoBefore:                arg.PhotoBefore,
		PhotoDetail:                arg.PhotoDetail,
		LocationNameViSnapshot:     arg.LocationNameViSnapshot,
		LocationNameZhSnapshot:     arg.LocationNameZhSnapshot,
		LocationNameEnSnapshot:     arg.LocationNameEnSnapshot,
		LocationSnapshotSource:     arg.LocationSnapshotSource,
		LocationSnapshotRecordedAt: arg.LocationSnapshotRecordedAt,
		AssetID:                    arg.AssetID,
		AssignedTeamID:             arg.AssignedTeamID,
		AssigneeID:                 arg.AssigneeID,
		CauseTeamID:                arg.CauseTeamID,
		CauseStatus:                arg.CauseStatus.String,
		Status:                     StatusOpen.String(),
		CreatedAt:                  time.Now(),
	}
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) CreateIssueWithSideEffects(ctx context.Context, params db.CreateIssueParams, tags []string, buildOutbox func(int64) []db.CreateOutboxEntryParams, buildScores func(int64) []db.InsertScoreLogParams) (db.Issue, error) {
	created, err := m.CreateIssue(ctx, params)
	if err != nil {
		return db.Issue{}, err
	}
	for _, tag := range tags {
		if tag == "" {
			continue
		}
		if err := m.InsertIssueTag(ctx, db.InsertIssueTagParams{IssueID: created.ID, TagCode: tag}); err != nil {
			delete(m.issues, created.ID)
			delete(m.tags, created.ID)
			return db.Issue{}, err
		}
	}
	m.outbox = append(m.outbox, buildOutbox(created.ID)...)
	m.scoreLogs = append(m.scoreLogs, buildScores(created.ID)...)
	return created, nil
}

// CreateIssueWithProposedTags mirrors the DB transaction: proposals become pending tag rows and
// are linked to the issue in the same call, so a failure leaves neither behind.
func (m *mockIssueStore) CreateIssueWithProposedTags(ctx context.Context, params db.CreateIssueParams, tags []string, proposed []db.UpsertProposedTagParams, buildOutbox func(int64) []db.CreateOutboxEntryParams, buildScores func(int64) []db.InsertScoreLogParams) (db.Issue, error) {
	created, err := m.CreateIssueWithSideEffects(ctx, params, tags, buildOutbox, buildScores)
	if err != nil {
		return db.Issue{}, err
	}
	for _, proposal := range proposed {
		m.pendingTags = append(m.pendingTags, proposal)
		if err := m.InsertIssueTag(ctx, db.InsertIssueTagParams{IssueID: created.ID, TagCode: proposal.Code}); err != nil {
			delete(m.issues, created.ID)
			delete(m.tags, created.ID)
			return db.Issue{}, err
		}
	}
	return created, nil
}

func (m *mockIssueStore) ResolveIssueAtomic(ctx context.Context, force bool, params db.ResolveIssueParams, forceParams db.ForceResolveIssueParams) (db.Issue, error) {
	if force {
		return m.ForceResolveIssue(ctx, forceParams)
	}
	return m.ResolveIssue(ctx, params)
}

func (m *mockIssueStore) InsertIssueTag(_ context.Context, arg db.InsertIssueTagParams) error {
	if m.tagInsertErr != nil {
		return m.tagInsertErr
	}
	m.tags[arg.IssueID] = append(m.tags[arg.IssueID], arg.TagCode)
	return nil
}

func (m *mockIssueStore) ListTagsForIssue(_ context.Context, issueID int64) ([]db.ListTagsForIssueRow, error) {
	tags := m.tags[issueID]
	rows := make([]db.ListTagsForIssueRow, 0, len(tags))
	for _, t := range tags {
		rows = append(rows, db.ListTagsForIssueRow{Code: t, NameVi: t})
	}
	return rows, nil
}

func (m *mockIssueStore) ListTagsForIssues(_ context.Context, issueIDs []int64) ([]db.ListTagsForIssuesRow, error) {
	rows := make([]db.ListTagsForIssuesRow, 0)
	for _, id := range issueIDs {
		for _, code := range m.tags[id] {
			rows = append(rows, db.ListTagsForIssuesRow{IssueID: id, Code: code, NameVi: code})
		}
	}
	return rows, nil
}

type countingIssueStore struct {
	*mockIssueStore
	tagCalls       int
	recipientCalls int
	visibleFilter  func(arg db.ListVisibleIssueEventRecipientsParams) ([]int64, error)
}

func (c *countingIssueStore) ListTagsForIssues(_ context.Context, issueIDs []int64) ([]db.ListTagsForIssuesRow, error) {
	c.tagCalls++
	return c.mockIssueStore.ListTagsForIssues(context.Background(), issueIDs)
}

func (c *countingIssueStore) ListVisibleIssueEventRecipients(_ context.Context, arg db.ListVisibleIssueEventRecipientsParams) ([]int64, error) {
	c.recipientCalls++
	if c.visibleFilter != nil {
		return c.visibleFilter(arg)
	}
	return c.mockIssueStore.ListVisibleIssueEventRecipients(context.Background(), arg)
}

func TestIssueService_ListIssuesFiltered_BatchesTagQueries(t *testing.T) {
	store := &countingIssueStore{mockIssueStore: newMockIssueStore()}
	store.issues[1] = db.Issue{ID: 1, ClientUuid: "u1", Version: 1, CreatorID: 1, Category: "1S", CauseType: "MANUAL", LocationCode: "LINE_A1", PhotoBefore: "a.jpg", Status: "OPEN", CreatedAt: time.Now()}
	store.issues[2] = db.Issue{ID: 2, ClientUuid: "u2", Version: 1, CreatorID: 1, Category: "2S", CauseType: "MANUAL", LocationCode: "LINE_A1", PhotoBefore: "b.jpg", Status: "OPEN", CreatedAt: time.Now()}
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền A1"}
	store.users[1] = db.User{ID: 1, Username: "tin", FullName: "Tin"}
	store.tags[1] = []string{"DIRT", "SCRAP"}
	store.tags[2] = []string{"SCRAP"}

	svc := NewService(store, nil, nil)
	items, total, err := svc.ListIssuesFiltered(ctxFor(store.users[1]), ListFilter{Page: 1, Limit: 20})
	if err != nil {
		t.Fatalf("ListIssuesFiltered error: %v", err)
	}
	if len(items) != 2 || total != 2 {
		t.Fatalf("expected 2 items with total 2, got %d items / total %d", len(items), total)
	}
	if store.tagCalls != 1 {
		t.Fatalf("expected exactly 1 batched tag query, got %d", store.tagCalls)
	}
	byID := make(map[int64]Response, len(items))
	for _, item := range items {
		byID[item.ID] = item
	}
	if got := byID[1].Tags; len(got) != 2 || got[0] != "DIRT" || got[1] != "SCRAP" {
		t.Errorf("expected issue 1 tags [DIRT SCRAP], got %v", got)
	}
	if got := byID[2].Tags; len(got) != 1 || got[0] != "SCRAP" {
		t.Errorf("expected issue 2 tags [SCRAP], got %v", got)
	}
}

func (m *mockIssueStore) DeleteIssueTags(_ context.Context, issueID int64) error {
	if m.tagDeleteErr != nil {
		return m.tagDeleteErr
	}
	delete(m.tags, issueID)
	return nil
}

func (m *mockIssueStore) PatchIssueWithTagsAtomic(ctx context.Context, arg db.PatchIssueParams, tags []string) (db.Issue, error) {
	issueBefore := m.issues[arg.ID]
	tagsBefore := append([]string(nil), m.tags[arg.ID]...)
	updated, err := m.PatchIssue(ctx, arg)
	if err != nil {
		return db.Issue{}, err
	}
	if err := m.DeleteIssueTags(ctx, arg.ID); err != nil {
		m.issues[arg.ID] = issueBefore
		m.tags[arg.ID] = tagsBefore
		return db.Issue{}, err
	}
	for _, tag := range tags {
		if tag == "" {
			continue
		}
		if err := m.InsertIssueTag(ctx, db.InsertIssueTagParams{IssueID: arg.ID, TagCode: tag}); err != nil {
			m.issues[arg.ID] = issueBefore
			m.tags[arg.ID] = tagsBefore
			return db.Issue{}, err
		}
	}
	return updated, nil
}

func (m *mockIssueStore) PatchIssueWithProposedTagsAtomic(ctx context.Context, arg db.PatchIssueParams, tags []string, proposed []db.UpsertProposedTagParams) (db.Issue, error) {
	updated, err := m.PatchIssueWithTagsAtomic(ctx, arg, tags)
	if err != nil {
		return db.Issue{}, err
	}
	for _, proposal := range proposed {
		m.pendingTags = append(m.pendingTags, proposal)
		if err := m.InsertIssueTag(ctx, db.InsertIssueTagParams{IssueID: arg.ID, TagCode: proposal.Code}); err != nil {
			return db.Issue{}, err
		}
	}
	return updated, nil
}
func (m *mockIssueStore) IncrementTagUseCount(_ context.Context, _ string) error {
	return nil
}

func TestIssueService_PatchIssue_TagFailureRollsBackIssueAndTags(t *testing.T) {
	for _, tc := range []struct {
		name       string
		setFailure func(*mockIssueStore)
	}{
		{name: "delete", setFailure: func(m *mockIssueStore) { m.tagDeleteErr = fmt.Errorf("delete tags") }},
		{name: "insert", setFailure: func(m *mockIssueStore) { m.tagInsertErr = fmt.Errorf("insert tag") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newMockIssueStore()
			store.issues[1] = db.Issue{ID: 1, ClientUuid: "u1", Version: 1, CreatorID: 10, Category: "1S", CauseType: "MANUAL", LocationCode: "LINE_A1", Status: "OPEN", CreatedAt: time.Now()}
			store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Line A1"}
			store.users[10] = db.User{ID: 10, Username: "worker", FullName: "Worker"}
			store.tags[1] = []string{"old"}
			beforeIssue := store.issues[1]
			beforeTags := append([]string(nil), store.tags[1]...)
			tc.setFailure(store)

			svc := NewService(store, nil, make(chan struct{}, 1))
			events, unsubscribe := svc.SubscribeEvents()
			defer unsubscribe()
			worker := store.users[10]
			newCategory := "6S"
			_, err := svc.PatchIssue(ctxFor(worker), PatchIssueRequest{
				IssueID:  1,
				Category: &newCategory,
				Tags:     []string{"new"},
			}, worker)
			if err == nil {
				t.Fatal("expected atomic tag failure")
			}
			if got := store.issues[1]; got.Version != beforeIssue.Version || got.Category != beforeIssue.Category {
				t.Fatalf("issue changed after failed tag mutation: before=%+v after=%+v", beforeIssue, got)
			}
			if got := store.tags[1]; len(got) != len(beforeTags) || got[0] != beforeTags[0] {
				t.Fatalf("tags changed after failed tag mutation: before=%v after=%v", beforeTags, got)
			}
			select {
			case event := <-events:
				t.Fatalf("unexpected event after failed patch: %+v", event)
			default:
			}
			if len(store.outbox) != 0 {
				t.Fatalf("unexpected notification side effect after failed patch: %+v", store.outbox)
			}
		})
	}
}

func (m *mockIssueStore) ListIssuesFiltered(_ context.Context, arg db.ListIssuesFilteredParams) ([]db.ListIssuesFilteredRow, error) {
	m.lastList = arg
	rows := make([]db.ListIssuesFilteredRow, 0, len(m.issues))
	for _, iss := range m.issues {
		u := m.users[iss.CreatorID]
		loc := m.locations[iss.LocationCode]
		rows = append(rows, db.ListIssuesFilteredRow{
			ID:              iss.ID,
			ClientUuid:      iss.ClientUuid,
			Version:         iss.Version,
			CreatorID:       iss.CreatorID,
			Category:        iss.Category,
			LocationCode:    iss.LocationCode,
			Description:     iss.Description,
			PhotoBefore:     iss.PhotoBefore,
			Status:          iss.Status,
			LocationNameVi:  loc.NameVi,
			CreatorUsername: u.Username,
			CreatorFullName: u.FullName,
			CreatedAt:       iss.CreatedAt,
		})
	}
	return rows, nil
}

func (m *mockIssueStore) CountIssuesFiltered(_ context.Context, arg db.CountIssuesFilteredParams) (int64, error) {
	m.lastCount = arg
	return int64(len(m.issues)), nil
}

func (m *mockIssueStore) ResolveIssue(_ context.Context, arg db.ResolveIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || iss.Status != StatusOpen.String() || iss.Version != arg.Version {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusPendingReview.String()
	iss.ResolverID = arg.ResolverID
	iss.PhotoAfter = arg.PhotoAfter
	iss.Version++
	now := time.Now()
	iss.ResolvedAt = sql.NullTime{Time: now, Valid: true}
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) ForceResolveIssue(_ context.Context, arg db.ForceResolveIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusPendingReview.String()
	iss.ResolverID = arg.ResolverID
	iss.PhotoAfter = arg.PhotoAfter
	iss.Version++
	now := time.Now()
	iss.ResolvedAt = sql.NullTime{Time: now, Valid: true}
	m.issues[iss.ID] = iss
	return iss, nil
}
func (m *mockIssueStore) GetTranslationCacheBatch(_ context.Context, arg db.GetTranslationCacheBatchParams) ([]db.GetTranslationCacheBatchRow, error) {
	if m.translations == nil {
		return nil, nil
	}
	var res []db.GetTranslationCacheBatchRow
	for _, h := range arg.ContentHashes {
		if text, ok := m.translations[h+":"+arg.TargetLang]; ok {
			res = append(res, db.GetTranslationCacheBatchRow{
				ContentHash:    h,
				TranslatedText: text,
			})
		}
	}
	return res, nil
}

func (m *mockIssueStore) CloseIssue(_ context.Context, arg db.CloseIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || iss.Status != StatusPendingReview.String() {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.ExpectedVersion.Valid && iss.Version != arg.ExpectedVersion.Int32 {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusClosed.String()
	iss.ScoreRating = arg.ScoreRating
	iss.Version++
	now := time.Now()
	iss.ClosedAt = sql.NullTime{Time: now, Valid: true}
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) ReopenIssue(_ context.Context, arg db.ReopenIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || iss.Status != StatusPendingReview.String() {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.ExpectedVersion.Valid && iss.Version != arg.ExpectedVersion.Int32 {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusOpen.String()
	iss.RejectReason = arg.RejectReason
	iss.Version++
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) InvalidateIssue(_ context.Context, arg db.InvalidateIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || (iss.Status != StatusOpen.String() && iss.Status != StatusPendingReview.String()) {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.ExpectedVersion.Valid && iss.Version != arg.ExpectedVersion.Int32 {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusInvalid.String()
	iss.RejectReason = arg.RejectReason
	iss.Version++
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) PatchIssue(_ context.Context, arg db.PatchIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.Category.Valid {
		iss.Category = arg.Category.String
	}
	if arg.CauseType.Valid {
		iss.CauseType = arg.CauseType.String
	}
	if arg.LocationCode.Valid {
		iss.LocationCode = arg.LocationCode.String
	}
	if arg.Description.Valid {
		iss.Description = arg.Description
	}
	if arg.PhotoBefore.Valid {
		iss.PhotoBefore = arg.PhotoBefore.String
	}
	if arg.PhotoDetail.Valid {
		iss.PhotoDetail = arg.PhotoDetail
	}
	iss.Version++
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) CreateOutboxEntry(_ context.Context, arg db.CreateOutboxEntryParams) (db.NotificationOutbox, error) {
	m.outbox = append(m.outbox, arg)
	return db.NotificationOutbox{}, nil
}

func (m *mockIssueStore) InsertScoreLog(_ context.Context, arg db.InsertScoreLogParams) error {
	m.scoreLogs = append(m.scoreLogs, arg)
	return nil
}
func (m *mockIssueStore) GetScoringRuleByKey(_ context.Context, key string) (db.ScoringRule, error) {
	points, ok := m.rules[key]
	if !ok {
		return db.ScoringRule{}, sql.ErrNoRows
	}
	return db.ScoringRule{RuleKey: key, Points: points}, nil
}

func (m *mockIssueStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	m.auditLogs = append(m.auditLogs, arg)
	return nil
}

func (m *mockIssueStore) GetLocationByCode(_ context.Context, code string) (db.Location, error) {
	loc, ok := m.locations[code]
	if !ok {
		return db.Location{}, sql.ErrNoRows
	}
	return loc, nil
}

func (m *mockIssueStore) GetUserByID(_ context.Context, id int64) (db.User, error) {
	u, ok := m.users[id]
	if !ok {
		return db.User{}, sql.ErrNoRows
	}
	return u, nil
}

func (m *mockIssueStore) ListActiveLocationCodesForUser(_ context.Context, arg db.ListActiveLocationCodesForUserParams) ([]string, error) {
	u, ok := m.users[arg.UserID]
	if ok && u.AssignedLocationCode.Valid {
		return []string{u.AssignedLocationCode.String}, nil
	}
	return nil, nil
}

func (m *mockIssueStore) GetAssetByID(_ context.Context, id int64) (db.Asset, error) {
	a, ok := m.assets[id]
	if !ok {
		return db.Asset{}, sql.ErrNoRows
	}
	return a, nil
}

func (m *mockIssueStore) GetTeamByID(_ context.Context, id int64) (db.Team, error) {
	t, ok := m.teams[id]
	if !ok {
		return db.Team{}, sql.ErrNoRows
	}
	return t, nil
}

func (m *mockIssueStore) GetTeamMembership(_ context.Context, arg db.GetTeamMembershipParams) (db.TeamMembership, error) {
	if _, ok := m.memberships[arg.TeamID][arg.UserID]; !ok {
		return db.TeamMembership{}, sql.ErrNoRows
	}
	return db.TeamMembership{TeamID: arg.TeamID, UserID: arg.UserID}, nil
}

func (m *mockIssueStore) GetIssueResponsibilityHistory(_ context.Context, targetID string) ([]db.ListIssueResponsibilityHistoryRow, error) {
	issueID, err := strconv.ParseInt(targetID, 10, 64)
	if err != nil {
		return nil, err
	}
	return m.history[issueID], nil
}

func (m *mockIssueStore) PatchIssueWithAuditAtomic(ctx context.Context, patch db.PatchIssueParams, tags []string, audit []db.InsertAuditLogParams) (db.Issue, error) {
	if m.auditErr != nil {
		return db.Issue{}, m.auditErr
	}
	issueBefore := m.issues[patch.ID]
	tagsBefore := append([]string(nil), m.tags[patch.ID]...)
	auditsBefore := len(m.auditLogs)
	updated, err := m.PatchIssue(ctx, patch)
	if err != nil {
		return db.Issue{}, err
	}
	if tags != nil {
		if err := m.DeleteIssueTags(ctx, patch.ID); err != nil {
			m.issues[patch.ID] = issueBefore
			m.tags[patch.ID] = tagsBefore
			return db.Issue{}, err
		}
		for _, tag := range tags {
			if tag == "" {
				continue
			}
			if err := m.InsertIssueTag(ctx, db.InsertIssueTagParams{IssueID: patch.ID, TagCode: tag}); err != nil {
				m.issues[patch.ID] = issueBefore
				m.tags[patch.ID] = tagsBefore
				m.auditLogs = m.auditLogs[:auditsBefore]
				return db.Issue{}, err
			}
		}
	}
	for _, entry := range audit {
		if err := m.InsertAuditLog(ctx, entry); err != nil {
			m.issues[patch.ID] = issueBefore
			m.tags[patch.ID] = tagsBefore
			m.auditLogs = m.auditLogs[:auditsBefore]
			return db.Issue{}, err
		}
	}
	return updated, nil
}

func createTestFileHeader(t *testing.T, fieldName, filename string, content []byte) *multipart.FileHeader {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("CreateFormFile error: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("Write part error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close writer error: %v", err)
	}

	req := httptest.NewRequest("POST", "/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err := req.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		t.Fatalf("ParseMultipartForm error: %v", err)
	}

	return req.MultipartForm.File[fieldName][0]
}

var testJPEGBytes = []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}

func mustTestStorageManager(t *testing.T) *storage.Manager {
	t.Helper()
	manager, err := storage.NewManager(t.TempDir())
	if err != nil {
		t.Fatalf("NewManager error: %v", err)
	}
	return manager
}

func TestIssueService_FullWorkflow(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "6s_test_issue_svc_*")
	defer func() { _ = os.RemoveAll(tempDir) }()

	storageMgr, _ := storage.NewManager(tempDir)
	store := newMockIssueStore()
	notifyCh := make(chan struct{}, 10)
	svc := NewService(store, storageMgr, notifyCh)

	eventsCh, unsub := svc.SubscribeEvents()
	defer unsub()

	// Setup mock data
	worker := db.User{ID: 10, Username: "worker", FullName: "Worker", Role: "USER", IsActive: true}
	admin := db.User{ID: 1, Username: "admin", FullName: "Admin", Role: "ADMIN", IsActive: true}
	store.users[worker.ID] = worker
	store.users[admin.ID] = admin
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}

	// 1. Sync new issue
	jpegBytes := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0x01}, 100)...)
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)

	clientUUID := "c0a80101-0000-4000-8000-000000000001"
	resp, created, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   clientUUID,
		Category:     "3S",
		LocationCode: "LINE_A1",
		Tags:         []string{"oil_leak"},
		Description:  "Dầu rỉ",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("SyncIssue error: %v", err)
	}
	if !created {
		t.Fatal("expected created=true")
	}
	if resp.Status != StatusOpen.String() {
		t.Errorf("expected status OPEN, got %s", resp.Status)
	}
	// Verify ISSUE_CREATED event received
	select {
	case evt := <-eventsCh:
		if evt.Type != EventIssueCreated || evt.IssueID != resp.ID {
			t.Errorf("unexpected event received: %+v", evt)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timeout waiting for ISSUE_CREATED event")
	}

	expectedBeforeURL := "/api/issues/1/media/before/" + clientUUID + "_wide.jpg"
	if resp.PhotoBefore != expectedBeforeURL {
		t.Errorf("expected photo_before %s, got %s", expectedBeforeURL, resp.PhotoBefore)
	}
	// 2. Resolve issue
	fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpegBytes)
	resolveUUID := "c0a80101-0000-4000-8000-000000000002"
	resResp, err := svc.ResolveIssue(ctxFor(worker), ResolveIssueRequest{
		IssueID:            resp.ID,
		ResolvedClientUUID: resolveUUID,
		ExpectedVersion:    resp.Version,
		PhotoAfter:         fhAfter,
	}, worker)
	if err != nil {
		t.Fatalf("ResolveIssue error: %v", err)
	}
	if resResp.Status != StatusPendingReview.String() {
		t.Errorf("expected status PENDING_REVIEW, got %s", resResp.Status)
	}
	expectedAfterURL := "/api/issues/1/media/after/" + resolveUUID + ".jpg"
	if resResp.PhotoAfter == nil || *resResp.PhotoAfter != expectedAfterURL {
		t.Errorf("expected photo_after %s, got %v", expectedAfterURL, resResp.PhotoAfter)
	}
	// 3. Close issue by Admin (score rating 5)
	expVer := resResp.Version
	closedResp, err := svc.CloseIssue(ctxFor(admin), CloseIssueRequest{
		IssueID:         resResp.ID,
		ScoreRating:     5,
		ExpectedVersion: &expVer,
	}, admin)
	if err != nil {
		t.Fatalf("CloseIssue error: %v", err)
	}
	if closedResp.Status != StatusClosed.String() {
		t.Errorf("expected status CLOSED, got %s", closedResp.Status)
	}
}

func TestIssueService_SyncIssue_PersistsLocalizedLocationSnapshot(t *testing.T) {
	store := newMockIssueStore()
	worker := db.User{ID: 10, Username: "worker", FullName: "Worker", Role: "USER", SiteID: 1, IsActive: true}
	store.users[worker.ID] = worker
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Tên hiện tại", SiteID: worker.SiteID}
	svc := NewService(store, mustTestStorageManager(t), make(chan struct{}, 1))

	resp, created, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:             "c0a80101-0000-4000-8000-000000000101",
		Category:               Category3S.String(),
		LocationCode:           "LINE_A1",
		LocationNameViSnapshot: "Tên cũ",
		LocationNameZhSnapshot: "旧名称",
		LocationNameEnSnapshot: "Previous name",
		LocationSnapshotSource: "CLIENT_CAPTURE",
		PhotoBefore:            createTestFileHeader(t, "photo_before", "before.jpg", testJPEGBytes),
	}, worker)
	if err != nil {
		t.Fatalf("SyncIssue error: %v", err)
	}
	if !created {
		t.Fatal("expected first sync to create an issue")
	}

	stored := store.issues[resp.ID]
	for name, got := range map[string]sql.NullString{
		"vi snapshot":     stored.LocationNameViSnapshot,
		"zh snapshot":     stored.LocationNameZhSnapshot,
		"en snapshot":     stored.LocationNameEnSnapshot,
		"snapshot source": stored.LocationSnapshotSource,
	} {
		if !got.Valid {
			t.Errorf("%s was not persisted", name)
		}
	}
	if stored.LocationNameViSnapshot.String != "Tên cũ" || stored.LocationNameZhSnapshot.String != "旧名称" || stored.LocationNameEnSnapshot.String != "Previous name" {
		t.Fatalf("localized snapshots not persisted: %+v", stored)
	}
	if stored.LocationSnapshotSource.String != "CLIENT_CAPTURE" || !stored.LocationSnapshotRecordedAt.Valid {
		t.Fatalf("snapshot metadata not persisted: source=%+v recorded_at=%+v", stored.LocationSnapshotSource, stored.LocationSnapshotRecordedAt)
	}
	if resp.LocationNameViSnapshot == nil || *resp.LocationNameViSnapshot != "Tên cũ" || resp.LocationNameZhSnapshot == nil || *resp.LocationNameZhSnapshot != "旧名称" || resp.LocationNameEnSnapshot == nil || *resp.LocationNameEnSnapshot != "Previous name" {
		t.Fatalf("localized snapshots missing from response: %+v", resp)
	}
	if resp.LocationSnapshotSource == nil || *resp.LocationSnapshotSource != "CLIENT_CAPTURE" || resp.LocationSnapshotRecordedAt == nil {
		t.Fatalf("snapshot metadata missing from response: source=%v recorded_at=%v", resp.LocationSnapshotSource, resp.LocationSnapshotRecordedAt)
	}
}

func TestIssueService_SyncIssue_IgnoresMalformedSnapshotsAndValidatesLocation(t *testing.T) {
	store := newMockIssueStore()
	worker := db.User{ID: 10, Username: "worker", FullName: "Worker", Role: "USER", SiteID: 1, IsActive: true}
	store.users[worker.ID] = worker
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Line A1", SiteID: worker.SiteID}
	svc := NewService(store, mustTestStorageManager(t), make(chan struct{}, 1))

	resp, created, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:             "c0a80101-0000-4000-8000-000000000102",
		Category:               Category3S.String(),
		LocationCode:           "LINE_A1",
		LocationNameViSnapshot: strings.Repeat("x", 256),
		LocationNameZhSnapshot: "   ",
		LocationNameEnSnapshot: "  English line  ",
		LocationSnapshotSource: "UNTRUSTED_SOURCE",
		PhotoBefore:            createTestFileHeader(t, "photo_before", "before.jpg", testJPEGBytes),
	}, worker)
	if err != nil || !created {
		t.Fatalf("valid location sync failed: created=%v err=%v", created, err)
	}
	stored := store.issues[resp.ID]
	if stored.LocationNameViSnapshot.Valid || stored.LocationNameZhSnapshot.Valid {
		t.Fatalf("malformed/oversized snapshots should be ignored: vi=%+v zh=%+v", stored.LocationNameViSnapshot, stored.LocationNameZhSnapshot)
	}
	if !stored.LocationNameEnSnapshot.Valid || stored.LocationNameEnSnapshot.String != "English line" {
		t.Fatalf("valid localized snapshot was not normalized: %+v", stored.LocationNameEnSnapshot)
	}
	if stored.LocationSnapshotSource.Valid || resp.LocationSnapshotSource != nil {
		t.Fatalf("malformed snapshot source should be ignored: stored=%+v response=%v", stored.LocationSnapshotSource, resp.LocationSnapshotSource)
	}
	if resp.LocationNameViSnapshot != nil || resp.LocationNameZhSnapshot != nil || resp.LocationNameEnSnapshot == nil || *resp.LocationNameEnSnapshot != "English line" {
		t.Fatalf("response exposed malformed snapshots: %+v", resp)
	}

	_, _, err = svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:             "c0a80101-0000-4000-8000-000000000103",
		Category:               Category3S.String(),
		LocationCode:           "UNKNOWN_LOCATION",
		LocationNameEnSnapshot: "Should not bypass location validation",
		PhotoBefore:            createTestFileHeader(t, "photo_before", "before.jpg", testJPEGBytes),
	}, worker)
	if err == nil || !errors.Is(err, ErrInvalidResponsibility) {
		t.Fatalf("expected invalid responsibility for unknown location, got %v", err)
	}
	if len(store.issues) != 1 {
		t.Fatalf("unknown location created an issue: %d stored issues", len(store.issues))
	}
}

func TestIssueService_SyncIssue_IdempotentRetryReturnsExistingSnapshot(t *testing.T) {
	store := newMockIssueStore()
	worker := db.User{ID: 10, Username: "worker", FullName: "Worker", Role: "USER", SiteID: 1, IsActive: true}
	store.users[worker.ID] = worker
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Line A1", SiteID: worker.SiteID}
	svc := NewService(store, mustTestStorageManager(t), make(chan struct{}, 1))
	clientUUID := "c0a80101-0000-4000-8000-000000000104"
	firstReq := SyncIssueRequest{
		ClientUUID:             clientUUID,
		Category:               Category3S.String(),
		LocationCode:           "LINE_A1",
		LocationNameViSnapshot: "Tên lần đầu",
		LocationSnapshotSource: "CLIENT_CAPTURE",
		PhotoBefore:            createTestFileHeader(t, "photo_before", "before.jpg", testJPEGBytes),
	}
	first, created, err := svc.SyncIssue(ctxFor(worker), firstReq, worker)
	if err != nil || !created {
		t.Fatalf("first sync failed: created=%v err=%v", created, err)
	}
	secondReq := firstReq
	secondReq.LocationNameViSnapshot = "Tên retry khác"
	secondReq.LocationSnapshotSource = "SERVER_CAPTURE"
	secondReq.PhotoBefore = createTestFileHeader(t, "photo_before", "retry.jpg", testJPEGBytes)
	second, created, err := svc.SyncIssue(ctxFor(worker), secondReq, worker)
	if err != nil {
		t.Fatalf("retry sync failed: %v", err)
	}
	if created {
		t.Fatal("idempotent retry reported a new issue")
	}
	if len(store.issues) != 1 || second.ID != first.ID {
		t.Fatalf("retry created a second issue or changed identity: first=%d second=%d stored=%d", first.ID, second.ID, len(store.issues))
	}
	if second.LocationNameViSnapshot == nil || *second.LocationNameViSnapshot != "Tên lần đầu" || second.LocationSnapshotSource == nil || *second.LocationSnapshotSource != "CLIENT_CAPTURE" {
		t.Fatalf("retry did not return the persisted snapshot: %+v", second)
	}
}
func TestIssueService_ConfiguredScoringRules(t *testing.T) {
	store := newMockIssueStore()
	store.rules = map[string]int32{
		"penalty_normal":         -7,
		"reward_reporter_normal": 9,
		"bonus_kaizen":           4,
		"penalty_reopen":         0,
	}
	svc := &ServiceImpl{store: store}
	issue := db.Issue{ID: 1, CreatorID: 2, LocationCode: "LINE_A1", Category: "3S"}
	svc.recordConfiguredScore(context.Background(), issue.ID, "LOCATION", issue.LocationCode, "penalty_normal", -2, false)
	svc.recordCloseReward(context.Background(), issue, 5)
	if len(store.scoreLogs) != 3 || store.scoreLogs[0].Points != -7 || store.scoreLogs[1].Points != 9 || store.scoreLogs[2].Points != 4 {
		t.Fatalf("configured scores not applied: %+v", store.scoreLogs)
	}
	svc.recordConfiguredScore(context.Background(), issue.ID, "LOCATION", issue.LocationCode, "penalty_reopen", -2, false)
	if len(store.scoreLogs) != 3 {
		t.Fatalf("invalid penalty rule awarded points: %+v", store.scoreLogs)
	}
	svc.recordConfiguredScore(context.Background(), issue.ID, "LOCATION", issue.LocationCode, "missing_rule", -2, false)
	if len(store.scoreLogs) != 4 || store.scoreLogs[3].Points != -2 {
		t.Fatalf("missing rule did not use default: %+v", store.scoreLogs)
	}
}

func TestIssueService_ReopenAndInvalidateAndPatch(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "6s_test_issue_svc_extra_*")
	defer os.RemoveAll(tempDir)

	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	mockStore.locations["LINE_A2"] = db.Location{Code: "LINE_A2", NameVi: "Chuyền May A2"}

	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	admin := db.User{ID: 1, Username: "admin", Role: "ADMIN", IsActive: true}
	otherWorker := db.User{ID: 20, Username: "worker2", Role: "USER", IsActive: true}

	mockStore.users[worker.ID] = worker
	mockStore.users[admin.ID] = admin
	mockStore.users[otherWorker.ID] = otherWorker

	storageMgr, _ := storage.NewManager(tempDir)
	notifyCh := make(chan struct{}, 10)
	svc := NewService(mockStore, storageMgr, notifyCh)

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)
	fhDetail := createTestFileHeader(t, "photo_detail", "detail.jpg", jpegBytes)

	// 1. Create issue with detail photo and tags
	clientUUID := "c0a80101-0000-4000-8000-000000000010"
	resp, created, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   clientUUID,
		Category:     "2S",
		LocationCode: "LINE_A1",
		Description:  "May A1 loi",
		Tags:         []string{"machine", "oil"},
		PhotoBefore:  fhBefore,
		PhotoDetail:  fhDetail,
	}, worker)
	if err != nil || !created {
		t.Fatalf("SyncIssue failed: %v", err)
	}

	// 2. Patch issue
	newCat := "3S"
	newLoc := "LINE_A2"
	newDesc := "Updated description text"
	patchResp, err := svc.PatchIssue(ctxFor(worker), PatchIssueRequest{
		IssueID:      resp.ID,
		Category:     &newCat,
		LocationCode: &newLoc,
		Description:  &newDesc,
		Tags:         []string{"safety"},
	}, worker)
	if err != nil {
		t.Fatalf("PatchIssue error: %v", err)
	}
	if patchResp.Category != Category3S.String() || patchResp.LocationCode != "LINE_A2" || patchResp.Description == nil || *patchResp.Description != newDesc {
		t.Errorf("PatchIssue mismatch: %s, %s, %v", patchResp.Category, patchResp.LocationCode, patchResp.Description)
	}

	// Non-owner cannot patch
	_, err = svc.PatchIssue(ctxFor(worker), PatchIssueRequest{
		IssueID:  resp.ID,
		Category: &newCat,
	}, otherWorker)
	if err != ErrPermissionDenied {
		t.Errorf("expected ErrPermissionDenied for non-owner, got %v", err)
	}

	// 3. Resolve issue
	fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpegBytes)
	resolveUUID := "c0a80101-0000-4000-8000-000000000020"
	resResp, err := svc.ResolveIssue(ctxFor(worker), ResolveIssueRequest{
		IssueID:            resp.ID,
		ResolvedClientUUID: resolveUUID,
		ExpectedVersion:    patchResp.Version,
		PhotoAfter:         fhAfter,
	}, worker)
	if err != nil {
		t.Fatalf("ResolveIssue error: %v", err)
	}

	// 4. Reopen issue by creator
	expVer := resResp.Version
	reopenedResp, err := svc.ReopenIssue(ctxFor(worker), ReopenIssueRequest{
		IssueID:         resResp.ID,
		RejectReason:    "Chưa sạch dầu",
		ExpectedVersion: &expVer,
	}, worker)
	if err != nil {
		t.Fatalf("ReopenIssue error: %v", err)
	}
	if reopenedResp.Status != StatusOpen.String() {
		t.Errorf("expected status OPEN after reopen, got %s", reopenedResp.Status)
	}

	// 5. Invalidate issue by Admin
	invVer := reopenedResp.Version
	invResp, err := svc.InvalidateIssue(ctxFor(admin), InvalidateIssueRequest{
		IssueID:         reopenedResp.ID,
		Reason:          "Không phải lỗi 6S",
		ExpectedVersion: &invVer,
	}, admin)
	if err != nil {
		t.Fatalf("InvalidateIssue error: %v", err)
	}
	if invResp.Status != StatusInvalid.String() {
		t.Errorf("expected status INVALID, got %s", invResp.Status)
	}

	// Worker cannot invalidate
	_, err = svc.InvalidateIssue(ctxFor(worker), InvalidateIssueRequest{
		IssueID: reopenedResp.ID,
		Reason:  "test",
	}, worker)
	if err != ErrPermissionDenied {
		t.Errorf("expected ErrPermissionDenied for worker invalidating, got %v", err)
	}
}

func TestIssueService_ValidationAndErrors(t *testing.T) {
	mockStore := newMockIssueStore()
	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}

	// Invalid category
	_, _, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000099",
		Category:     "INVALID_CAT",
		LocationCode: "LINE_A1",
	}, worker)
	if err == nil {
		t.Fatal("expected error for invalid category")
	}

	// Issue not found
	_, err = svc.GetIssueByID(ctxFor(worker), 99999)
	if err != ErrIssueNotFound {
		t.Errorf("expected ErrIssueNotFound, got %v", err)
	}
}

func TestIssueService_ListIssuesFiltered(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	mockStore.users[worker.ID] = worker
	mockStore.issues[1] = db.Issue{
		ID:           1,
		ClientUuid:   "c0a80101-0000-4000-8000-000000000001",
		CreatorID:    worker.ID,
		Category:     Category1S.String(),
		LocationCode: "LINE_A1",
		Status:       StatusOpen.String(),
		CreatedAt:    time.Now(),
	}

	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))

	items, total, err := svc.ListIssuesFiltered(ctxFor(worker), ListFilter{Statuses: []string{StatusOpen.String()}, Categories: []string{Category1S.String()}, LocationCodes: []string{"LINE_A1"}, Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("ListIssuesFiltered err: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Errorf("expected 1 item, got total=%d, len=%d", total, len(items))
	}
}

func TestIssueService_ListIssuesFiltered_PassesTagCodeToQueries(t *testing.T) {
	store := newMockIssueStore()
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	store.users[worker.ID] = worker
	store.issues[1] = db.Issue{ID: 1, CreatorID: worker.ID, Category: Category1S.String(), LocationCode: "LINE_A1", Status: StatusOpen.String(), CreatedAt: time.Now()}
	store.tags[1] = []string{"oil_leak"}
	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(store, storageMgr, make(chan struct{}, 1))
	var tagCode = "oil_leak"
	if _, _, err := svc.ListIssuesFiltered(ctxFor(worker), ListFilter{TagCode: &tagCode, Page: 1, Limit: 10}); err != nil {
		t.Fatalf("ListIssuesFiltered with tag code failed: %v", err)
	}
	if !store.lastList.TagCode.Valid || store.lastList.TagCode.String != tagCode || !store.lastCount.TagCode.Valid || store.lastCount.TagCode.String != tagCode {
		t.Fatalf("expected tag_code forwarded to list and count queries, got list=%+v count=%+v", store.lastList.TagCode, store.lastCount.TagCode)
	}
}

func TestIssueService_ForceResolveAndSafetyClose(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	safety := db.User{ID: 2, Username: "safety", Role: "SAFETY_OFFICER", IsActive: true}
	mockStore.users[worker.ID] = worker
	mockStore.users[safety.ID] = safety

	tempDir := t.TempDir()
	storageMgr, _ := storage.NewManager(tempDir)
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)
	fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpegBytes)

	resp, _, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000077",
		Category:     Category6S.String(),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync 6S issue failed: %v", err)
	}

	// Force resolve
	resResp, err := svc.ResolveIssue(ctxFor(worker), ResolveIssueRequest{
		IssueID:            resp.ID,
		ResolvedClientUUID: "c0a80101-0000-4000-8000-000000000078",
		Force:              true,
		PhotoAfter:         fhAfter,
	}, worker)
	if err != nil {
		t.Fatalf("Force resolve error: %v", err)
	}

	// Normal worker cannot close 6S issue
	_, err = svc.CloseIssue(ctxFor(worker), CloseIssueRequest{
		IssueID:     resResp.ID,
		ScoreRating: 5,
	}, worker)
	if err != ErrPermissionDenied {
		t.Errorf("expected ErrPermissionDenied for worker closing 6S issue, got %v", err)
	}

	// Safety officer can close 6S issue
	closed, err := svc.CloseIssue(ctxFor(safety), CloseIssueRequest{
		IssueID:     resResp.ID,
		ScoreRating: 5,
	}, safety)
	if err != nil {
		t.Fatalf("Safety officer close error: %v", err)
	}
	if closed.Status != StatusClosed.String() {
		t.Errorf("expected status CLOSED, got %s", closed.Status)
	}
}

func TestIssueService_CauseTypeClassification(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))

	worker := db.User{
		ID:       1,
		Username: "worker1",
		FullName: "Worker One",
		Role:     "USER",
	}

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)
	// 1. Explicit BEHAVIOR
	resp1, _, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000091",
		Category:     Category6S.String(),
		CauseType:    string(CauseTypeBehavior),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync issue 1 failed: %v", err)
	}
	if resp1.CauseType != string(CauseTypeBehavior) {
		t.Errorf("expected CauseType BEHAVIOR, got %s", resp1.CauseType)
	}

	// 2. Default 5S -> BEHAVIOR
	resp2, _, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000092",
		Category:     Category5S.String(),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync issue 2 failed: %v", err)
	}
	if resp2.CauseType != string(CauseTypeBehavior) {
		t.Errorf("expected CauseType BEHAVIOR for 5S, got %s", resp2.CauseType)
	}

	// 3. Default 1S -> CONDITION
	resp3, _, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000093",
		Category:     Category1S.String(),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync issue 3 failed: %v", err)
	}
	if resp3.CauseType != string(CauseTypeCondition) {
		t.Errorf("expected CauseType CONDITION for 1S, got %s", resp3.CauseType)
	}
}

func TestListIssuesFiltered_AttachTranslationCache(t *testing.T) {
	mockStore := newMockIssueStore()
	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, nil)

	desc := "Khu vực để đồ lộn xộn"
	h := ai.ComputeContentHash(desc)
	mockStore.translations[h+":en"] = "Cluttered storage area"

	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền A1"}
	mockStore.issues[1] = db.Issue{
		ID:           1,
		ClientUuid:   "c0a80101-0000-4000-8000-000000000099",
		LocationCode: "LINE_A1",
		Category:     "1S",
		Description:  sql.NullString{String: desc, Valid: true},
		Status:       "OPEN",
		CreatedAt:    time.Now(),
	}

	ctx := i18n.WithLocale(context.Background(), "en")
	resp, err := svc.GetIssueByID(ctx, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.TranslatedDescription == nil || *resp.TranslatedDescription != "Cluttered storage area" {
		t.Errorf("expected translated description 'Cluttered storage area', got %v", resp.TranslatedDescription)
	}

	items, _, err := svc.ListIssuesFiltered(ctx, ListFilter{Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("unexpected list error: %v", err)
	}
	if len(items) == 0 || items[0].TranslatedDescription == nil || *items[0].TranslatedDescription != "Cluttered storage area" {
		t.Errorf("expected list item to have translated description 'Cluttered storage area', got %+v", items)
	}
}

// Permission-based authorization parity with SPEC.md 5.2 seed defaults.
func TestIssueService_PermissionParity(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	mockStore.locations["LINE_A2"] = db.Location{Code: "LINE_A2", NameVi: "Chuyền May A2"}

	creator := db.User{ID: 10, Username: "creator", Role: "USER", IsActive: true}
	stranger := db.User{ID: 11, Username: "stranger", Role: "USER", IsActive: true}
	leader := db.User{ID: 20, Username: "leader", Role: "LINE_LEADER", IsActive: true, AssignedLocationCode: sql.NullString{String: "LINE_A1", Valid: true}}
	leaderOther := db.User{ID: 21, Username: "leader2", Role: "LINE_LEADER", IsActive: true, AssignedLocationCode: sql.NullString{String: "LINE_A2", Valid: true}}
	safety := db.User{ID: 30, Username: "safety", Role: "SAFETY_OFFICER", IsActive: true}
	admin := db.User{ID: 1, Username: "admin", Role: "ADMIN", IsActive: true}
	superadmin := db.User{ID: 2, Username: "superadmin", Role: "SUPERADMIN", IsActive: true}
	for _, u := range []db.User{creator, stranger, leader, leaderOther, safety, admin, superadmin} {
		mockStore.users[u.ID] = u
	}

	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))
	sequence := int64(100)
	nextUUID := func() string {
		sequence++
		return fmt.Sprintf("c0a80101-0000-4000-8000-%012d", sequence)
	}

	newPendingIssue := func(t *testing.T, category, location string) *Response {
		t.Helper()
		jpeg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
		fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpeg)
		fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpeg)
		resp, _, err := svc.SyncIssue(ctxFor(creator), SyncIssueRequest{
			ClientUUID:   nextUUID(),
			Category:     category,
			LocationCode: location,
			PhotoBefore:  fhBefore,
		}, creator)
		if err != nil {
			t.Fatalf("sync issue failed: %v", err)
		}
		if _, err := svc.ResolveIssue(ctxFor(creator), ResolveIssueRequest{
			IssueID:            resp.ID,
			ResolvedClientUUID: nextUUID(),
			ExpectedVersion:    resp.Version,
			PhotoAfter:         fhAfter,
		}, creator); err != nil {
			t.Fatalf("resolve issue failed: %v", err)
		}
		updated, err := svc.GetIssueByID(context.Background(), resp.ID)
		if err != nil {
			t.Fatalf("reload issue failed: %v", err)
		}
		return updated
	}
	newPendingIssueWithResolver := func(t *testing.T, resolver db.User) *Response {
		t.Helper()
		jpeg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
		fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpeg)
		fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpeg)
		resp, _, err := svc.SyncIssue(ctxFor(creator), SyncIssueRequest{
			ClientUUID:   nextUUID(),
			Category:     Category1S.String(),
			LocationCode: "LINE_A1",
			PhotoBefore:  fhBefore,
		}, creator)
		if err != nil {
			t.Fatalf("sync issue failed: %v", err)
		}
		stored, _ := svc.GetIssueByID(context.Background(), resp.ID)
		if _, err := svc.ResolveIssue(ctxFor(resolver), ResolveIssueRequest{
			IssueID:            resp.ID,
			ResolvedClientUUID: nextUUID(),
			ExpectedVersion:    resp.Version,
			PhotoAfter:         fhAfter,
		}, resolver); err != nil {
			t.Fatalf("resolve issue by %s failed: %v (resp version %d stored %+v)", resolver.Username, err, resp.Version, stored)
		}
		updated, err := svc.GetIssueByID(context.Background(), resp.ID)
		if err != nil {
			t.Fatalf("reload issue failed: %v", err)
		}
		return updated
	}

	deny := func(t *testing.T, err error, who, what string) {
		t.Helper()
		if err != ErrPermissionDenied {
			t.Errorf("%s should be denied %s (seed parity), got %v", who, what, err)
		}
	}

	// Close: USER cannot close others' issues (1S-5S and 6S).
	normal := newPendingIssue(t, Category1S.String(), "LINE_A1")
	_, err := svc.CloseIssue(ctxFor(stranger), CloseIssueRequest{IssueID: normal.ID, ScoreRating: 3}, stranger)
	deny(t, err, "USER stranger", "close others' 1S issue")

	_, err = svc.CloseIssue(ctxFor(creator), CloseIssueRequest{IssueID: normal.ID, ScoreRating: 3}, creator)
	if err != ErrIssueSelfReviewDenied {
		t.Errorf("USER creator (self resolver) should receive self-review error, got %v", err)
	}
	// Close: creator may close own issue resolved by another party (approval separate from fix).
	resolver := db.User{ID: 44, Username: "resolver", Role: "USER", IsActive: true, AssignedLocationCode: sql.NullString{String: "LINE_A1", Valid: true}}
	mockStore.users[resolver.ID] = resolver
	normal2 := newPendingIssueWithResolver(t, resolver)
	// Regression: resolver cannot approve own work by closing it.
	_, err = svc.CloseIssue(ctxFor(resolver), CloseIssueRequest{IssueID: normal2.ID, ScoreRating: 3}, resolver)
	deny(t, err, "USER resolver", "close own-resolved issue")
	normal3 := newPendingIssueWithResolver(t, resolver)
	ownClosed, err := svc.CloseIssue(ctxFor(creator), CloseIssueRequest{IssueID: normal3.ID, ScoreRating: 3}, creator)
	if err != nil || ownClosed.Status != StatusClosed.String() {
		t.Errorf("creator close own issue (resolved by other) failed: %v", err)
	}

	// Close: LINE_LEADER closes issue on assigned line, not other lines.
	lineIssue := newPendingIssue(t, Category2S.String(), "LINE_A1")
	_, err = svc.CloseIssue(ctxFor(leaderOther), CloseIssueRequest{IssueID: lineIssue.ID, ScoreRating: 3}, leaderOther)
	deny(t, err, "LINE_LEADER (other line)", "close LINE_A1 issue")
	lineClosed, err := svc.CloseIssue(ctxFor(leader), CloseIssueRequest{IssueID: lineIssue.ID, ScoreRating: 3}, leader)
	if err != nil || lineClosed.Status != StatusClosed.String() {
		t.Errorf("LINE_LEADER close own-line issue failed: %v", err)
	}

	// Close: 6S restricted to SAFETY_OFFICER/ADMIN; LINE_LEADER blocked.
	safetyIssue := newPendingIssue(t, Category6S.String(), "LINE_A1")
	_, err = svc.CloseIssue(ctxFor(leader), CloseIssueRequest{IssueID: safetyIssue.ID, ScoreRating: 3}, leader)
	deny(t, err, "LINE_LEADER", "close 6S issue")
	_, err = svc.CloseIssue(ctxFor(creator), CloseIssueRequest{IssueID: safetyIssue.ID, ScoreRating: 3}, creator)
	deny(t, err, "USER creator", "close 6S issue")
	safetyClosed, err := svc.CloseIssue(ctxFor(safety), CloseIssueRequest{IssueID: safetyIssue.ID, ScoreRating: 3}, safety)
	if err != nil || safetyClosed.Status != StatusClosed.String() {
		t.Errorf("SAFETY_OFFICER close 6S issue failed: %v", err)
	}
	adminIssue := newPendingIssue(t, Category6S.String(), "LINE_A1")
	adminClosed, err := svc.CloseIssue(ctxFor(admin), CloseIssueRequest{IssueID: adminIssue.ID, ScoreRating: 3}, admin)
	if err != nil || adminClosed.Status != StatusClosed.String() {
		t.Errorf("ADMIN close 6S issue failed: %v", err)
	}

	superadminIssue := newPendingIssue(t, Category3S.String(), "LINE_A1")
	superadminClosed, err := svc.CloseIssue(ctxFor(superadmin), CloseIssueRequest{IssueID: superadminIssue.ID, ScoreRating: 4}, superadmin)
	if err != nil || superadminClosed.Status != StatusClosed.String() {
		t.Errorf("SUPERADMIN close normal issue failed: %v", err)
	}
	superadminSafetyIssue := newPendingIssue(t, Category6S.String(), "LINE_A1")
	superadminSafetyClosed, err := svc.CloseIssue(ctxFor(superadmin), CloseIssueRequest{IssueID: superadminSafetyIssue.ID, ScoreRating: 4}, superadmin)
	if err != nil || superadminSafetyClosed.Status != StatusClosed.String() {
		t.Errorf("SUPERADMIN close 6S issue failed: %v", err)
	}

	// Close: fail closed without permission context.
	plainIssue := newPendingIssue(t, Category3S.String(), "LINE_A1")
	_, err = svc.CloseIssue(context.Background(), CloseIssueRequest{IssueID: plainIssue.ID, ScoreRating: 3}, admin)
	deny(t, err, "context without permissions", "close issue")

	// Reopen mirrors close scope: stranger blocked, leader on assigned line allowed.
	reopenIssue := newPendingIssue(t, Category4S.String(), "LINE_A1")
	_, err = svc.ReopenIssue(ctxFor(stranger), ReopenIssueRequest{IssueID: reopenIssue.ID, RejectReason: "làm lại"}, stranger)
	deny(t, err, "USER stranger", "reopen others' issue")
	if _, err := svc.ReopenIssue(ctxFor(leader), ReopenIssueRequest{IssueID: reopenIssue.ID, RejectReason: "làm lại"}, leader); err != nil {
		t.Errorf("LINE_LEADER reopen own-line issue failed: %v", err)
	}

	// Invalidate: only SAFETY_OFFICER/ADMIN.
	invalidIssue := newPendingIssue(t, Category5S.String(), "LINE_A1")
	for _, u := range []db.User{creator, leader, leaderOther} {
		_, err = svc.InvalidateIssue(ctxFor(u), InvalidateIssueRequest{IssueID: invalidIssue.ID, Reason: "spam"}, u)
		deny(t, err, u.Role, "invalidate issue")
	}
	if _, err := svc.InvalidateIssue(ctxFor(safety), InvalidateIssueRequest{IssueID: invalidIssue.ID, Reason: "spam"}, safety); err != nil {
		t.Errorf("SAFETY_OFFICER invalidate failed: %v", err)
	}
	invalidIssue2 := newPendingIssue(t, Category5S.String(), "LINE_A1")
	if _, err := svc.InvalidateIssue(ctxFor(admin), InvalidateIssueRequest{IssueID: invalidIssue2.ID, Reason: "spam"}, admin); err != nil {
		t.Errorf("ADMIN invalidate failed: %v", err)
	}

	// Patch: creator/resolver with close_own allowed; stranger denied; close_any/safety privileged allowed.
	patchIssue := newPendingIssue(t, Category2S.String(), "LINE_A1")
	newCat := Category3S.String()
	if _, err := svc.PatchIssue(ctxFor(creator), PatchIssueRequest{IssueID: patchIssue.ID, Category: &newCat}, creator); err != nil {
		t.Errorf("creator patch failed: %v", err)
	}
	_, err = svc.PatchIssue(ctxFor(stranger), PatchIssueRequest{IssueID: patchIssue.ID, Category: &newCat}, stranger)
	deny(t, err, "USER stranger", "patch others' issue")
	if _, err := svc.PatchIssue(ctxFor(safety), PatchIssueRequest{IssueID: patchIssue.ID, Category: &newCat}, safety); err != nil {
		t.Errorf("SAFETY_OFFICER patch failed: %v", err)
	}
	_, err = svc.PatchIssue(ctxFor(leader), PatchIssueRequest{IssueID: patchIssue.ID, Category: &newCat}, leader)
	deny(t, err, "LINE_LEADER", "patch others' issue")
}

func TestIssueService_ResolveFailureRemovesOrphanAfterPhoto(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	mockStore.users[worker.ID] = worker

	tempDir := t.TempDir()
	storageMgr, _ := storage.NewManager(tempDir)
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)
	fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpegBytes)

	resp, _, err := svc.SyncIssue(ctxFor(worker), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000091",
		Category:     Category1S.String(),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync issue failed: %v", err)
	}

	// Stale expected version makes the mock resolve fail, exercising the cleanup path.
	_, err = svc.ResolveIssue(ctxFor(worker), ResolveIssueRequest{
		IssueID:            resp.ID,
		ResolvedClientUUID: "c0a80101-0000-4000-8000-000000000092",
		ExpectedVersion:    resp.Version + 99,
		PhotoAfter:         fhAfter,
	}, worker)
	if err == nil {
		t.Fatal("expected resolve failure on stale version")
	}

	afterDir := filepath.Join(tempDir, "after")
	entries, readErr := os.ReadDir(afterDir)
	if readErr != nil {
		t.Fatalf("read after dir: %v", readErr)
	}
	if len(entries) != 0 {
		t.Fatalf("orphan after photo not removed: %v", entries)
	}
}

func TestIssueService_ResponsibilityHistoryActions(t *testing.T) {
	store := newMockIssueStore()
	admin := db.User{ID: 1, Username: "admin", FullName: "Admin", Role: "ADMIN", SiteID: 1, IsActive: true}
	store.users[admin.ID] = admin
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	store.issues[1] = db.Issue{
		ID: 1, ClientUuid: "c0a80101-0000-4000-8000-0000000000a1", Version: 2, SiteID: 1,
		CreatorID: admin.ID, LocationCode: "LINE_A1", Category: "3S", VisibilityClass: "SITE_PUBLIC",
		Status: StatusOpen.String(), CauseStatus: CauseStatusConfirmed, CreatedAt: time.Now(),
	}
	store.history[1] = []db.ListIssueResponsibilityHistoryRow{
		{ID: 1, Action: auditActionAssignResponsibility, OldValue: []byte(`{"assigned_team_id":null,"assignee_id":null}`), NewValue: []byte(`{"assigned_team_id":5,"assignee_id":10}`), CreatedAt: time.Now()},
		{ID: 2, Action: auditActionAssignResponsibility, OldValue: []byte(`{"assigned_team_id":5,"assignee_id":10}`), NewValue: []byte(`{"assigned_team_id":6,"assignee_id":null}`), CreatedAt: time.Now()},
		{ID: 3, Action: auditActionAssignResponsibility, OldValue: []byte(`{"asset_id":7,"assigned_team_id":6,"assignee_id":null}`), NewValue: []byte(`{"asset_id":8,"assigned_team_id":6,"assignee_id":null}`), CreatedAt: time.Now()},
		{ID: 4, Action: auditActionVerifyCause, OldValue: []byte(`{"cause_status":"UNVERIFIED"}`), NewValue: []byte(`{"cause_status":"CONFIRMED"}`), CreatedAt: time.Now()},
	}

	tempDir := t.TempDir()
	storageMgr, _ := storage.NewManager(tempDir)
	svc := NewService(store, storageMgr, make(chan struct{}, 1))

	resp, err := svc.GetIssueByID(ctxFor(admin), 1)
	if err != nil {
		t.Fatalf("GetIssueByID error: %v", err)
	}
	actions := make([]string, 0, len(resp.ResponsibilityHistory))
	for _, entry := range resp.ResponsibilityHistory {
		actions = append(actions, entry.Action)
	}
	want := []string{HistoryActionAssign, HistoryActionTransfer, HistoryActionOther, HistoryActionCauseVerify}
	if fmt.Sprint(actions) != fmt.Sprint(want) {
		t.Fatalf("history actions = %v, want %v", actions, want)
	}
	if got := resp.ResponsibilityHistory[3].NewValue; string(got) != `{"cause_status":"CONFIRMED"}` {
		t.Fatalf("cause verification payload not preserved: %s", got)
	}
}

func TestIssueService_Broadcast_QueryCountIndependentOfSubscribers(t *testing.T) {
	store := &countingIssueStore{
		mockIssueStore: newMockIssueStore(),
		visibleFilter: func(arg db.ListVisibleIssueEventRecipientsParams) ([]int64, error) {
			var allowed []int64
			for _, id := range arg.UserIds {
				// Only odd IDs are visible to this issue in our test scenario.
				if id%2 != 0 {
					allowed = append(allowed, id)
				}
			}
			return allowed, nil
		},
	}

	tempDir := t.TempDir()
	storageMgr, _ := storage.NewManager(tempDir)
	svc := NewService(store, storageMgr, make(chan struct{}, 1))

	// Subscribe 5 users (101, 102, 103, 104, 105).
	subs := make(map[int64]<-chan Event)
	for _, id := range []int64{101, 102, 103, 104, 105} {
		ch, unsub := svc.SubscribeEvents(id)
		defer unsub()
		subs[id] = ch
	}

	ctx := context.Background()
	svc.broadcast(ctx, Event{Type: EventIssueUpdated, IssueID: 42})

	// Single batched query was executed despite 5 subscribers.
	if store.recipientCalls != 1 {
		t.Fatalf("expected exactly 1 recipient query for 5 subscribers, got %d", store.recipientCalls)
	}

	// Verify authorized subscribers (101, 103, 105) received event.
	for _, id := range []int64{101, 103, 105} {
		select {
		case evt := <-subs[id]:
			if evt.Type != EventIssueUpdated || evt.IssueID != 42 {
				t.Fatalf("subscriber %d received unexpected event: %+v", id, evt)
			}
		case <-time.After(100 * time.Millisecond):
			t.Fatalf("subscriber %d did not receive event", id)
		}
	}

	// Verify unauthorized subscribers (102, 104) did not receive event.
	for _, id := range []int64{102, 104} {
		select {
		case evt := <-subs[id]:
			t.Fatalf("subscriber %d unexpectedly received event: %+v", id, evt)
		default:
			// Expected.
		}
	}

	// Subscribe 10 more users (200..209).
	for id := int64(200); id < 210; id++ {
		_, unsub := svc.SubscribeEvents(id)
		defer unsub()
	}

	svc.broadcast(ctx, Event{Type: EventIssueUpdated, IssueID: 42})

	// Total query count must be exactly 2 (1 per broadcast, zero scaling with 15 subscribers).
	if store.recipientCalls != 2 {
		t.Fatalf("expected exactly 2 recipient queries across 2 broadcasts, got %d", store.recipientCalls)
	}
}

func TestSyncIssue_ProposedTags_Workflow(t *testing.T) {
	storageMgr, _ := storage.NewManager(t.TempDir())
	store := newMockIssueStore()
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền A1"}
	svc := NewService(store, storageMgr, nil)
	creator := db.User{ID: 7, SiteID: 1, Role: "USER", Username: "worker7", FullName: "Worker 7", IsActive: true}
	store.users[creator.ID] = creator

	clientUUID := "c0a80101-0000-4000-8000-000000009999"
	req := SyncIssueRequest{
		ClientUUID:   clientUUID,
		Category:     Category1S.String(),
		LocationCode: "LINE_A1",
		Tags:         []string{"scrap_material"},
		ProposedTags: []ProposedTag{
			{NameVi: "Thùng hỏng", NameZh: "破损箱", NameEn: "Broken bin", Category: "1S"},
		},
		PhotoBefore: createTestFileHeader(t, "photo_before", "before.jpg", testJPEGBytes),
	}

	resp, created, err := svc.SyncIssue(ctxFor(creator), req, creator)
	if err != nil {
		t.Fatalf("SyncIssue with proposed tags failed: %v", err)
	}
	if !created {
		t.Fatal("expected created=true for new issue")
	}
	if len(resp.Tags) != 2 {
		t.Fatalf("expected 2 tags on issue, got %v", resp.Tags)
	}
	if len(store.pendingTags) != 1 {
		t.Fatalf("expected 1 pending tag stored, got %d", len(store.pendingTags))
	}
	pending := store.pendingTags[0]
	if pending.Category != Category1S.String() || pending.NameVi != "Thùng hỏng" || !strings.HasPrefix(pending.Code, "pending_") {
		t.Fatalf("unexpected pending tag payload: %+v", pending)
	}
	if !pending.CreatedBy.Valid || pending.CreatedBy.Int64 != 7 {
		t.Fatalf("expected pending tag created_by=7, got %+v", pending.CreatedBy)
	}

	// Idempotency: replay the same request with clientUUID
	resp2, created2, err2 := svc.SyncIssue(ctxFor(creator), req, creator)
	if err2 != nil {
		t.Fatalf("idempotent replay failed: %v", err2)
	}
	if created2 {
		t.Fatal("expected created=false on replay")
	}
	if resp2.ID != resp.ID {
		t.Fatalf("expected same issue ID on replay: %d vs %d", resp2.ID, resp.ID)
	}

	// Patch issue with proposed tags
	patchResp, patchErr := svc.PatchIssue(ctxFor(creator), PatchIssueRequest{
		IssueID: resp.ID,
		Tags:    []string{"scrap_material"},
		ProposedTags: []ProposedTag{
			{NameVi: "Thùng nứt", NameZh: "破裂箱", NameEn: "Cracked bin", Category: "1S"},
		},
	}, creator)
	if patchErr != nil {
		t.Fatalf("PatchIssue with proposed tags failed: %v", patchErr)
	}
	if len(patchResp.Tags) != 2 {
		t.Fatalf("expected 2 tags after patch with proposal, got %v", patchResp.Tags)
	}
	if len(store.pendingTags) != 2 {
		t.Fatalf("expected 2 pending tags stored total, got %d", len(store.pendingTags))
	}

	// Validation: more than 5 proposed tags rejected
	tooMany := make([]ProposedTag, 6)
	for i := 0; i < 6; i++ {
		tooMany[i] = ProposedTag{NameVi: fmt.Sprintf("Tag %d", i), NameZh: "Tag", NameEn: "Tag", Category: "1S"}
	}
	_, _, err = svc.SyncIssue(ctxFor(creator), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000009991",
		Category:     Category1S.String(),
		LocationCode: "LINE_A1",
		ProposedTags: tooMany,
		PhotoBefore:  createTestFileHeader(t, "photo_before", "before.jpg", testJPEGBytes),
	}, creator)
	if err == nil || !strings.Contains(err.Error(), "at most 5") {
		t.Fatalf("expected error for >5 proposed tags, got %v", err)
	}
}

func TestBuildProposedTagParams_ValidatesAndDeduplicates(t *testing.T) {
	creator := db.User{ID: 7}
	base := SyncIssueRequest{Category: Category1S.String()}

	tests := []struct {
		name      string
		proposals []ProposedTag
		wantErr   string
		wantCount int
	}{
		{
			name:      "missing translation",
			proposals: []ProposedTag{{NameVi: "Thùng hỏng", NameEn: "Broken bin", Category: Category1S.String()}},
			wantErr:   "names are required",
		},
		{
			name:      "category mismatch",
			proposals: []ProposedTag{{NameVi: "Thùng hỏng", NameZh: "破损箱", NameEn: "Broken bin", Category: Category2S.String()}},
			wantErr:   "category is invalid",
		},
		{
			name:      "name too long",
			proposals: []ProposedTag{{NameVi: strings.Repeat("x", 256), NameZh: "箱", NameEn: "Bin", Category: Category1S.String()}},
			wantErr:   "names are too long",
		},
		{
			name: "duplicate proposals are collapsed",
			proposals: []ProposedTag{
				{NameVi: " Thùng hỏng ", NameZh: "破损箱", NameEn: "Broken bin", Category: Category1S.String()},
				{NameVi: "Thùng hỏng", NameZh: "破损箱", NameEn: "Broken bin", Category: Category1S.String()},
			},
			wantCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := base
			req.ProposedTags = tt.proposals
			got, err := buildProposedTagParams(req, creator)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error = %v, want substring %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("buildProposedTagParams: %v", err)
			}
			if len(got) != tt.wantCount {
				t.Fatalf("got %d proposals, want %d", len(got), tt.wantCount)
			}
			if !strings.HasPrefix(got[0].Code, "pending_") {
				t.Fatalf("proposal code is not pending-scoped: %q", got[0].Code)
			}
		})
	}
}

func TestBuildProposedTagParams_CodeIsCreatorScoped(t *testing.T) {
	req := SyncIssueRequest{
		Category: Category1S.String(),
		ProposedTags: []ProposedTag{{
			NameVi: "Thùng hỏng", NameZh: "破损箱", NameEn: "Broken bin", Category: Category1S.String(),
		}},
	}
	first, err := buildProposedTagParams(req, db.User{ID: 7})
	if err != nil {
		t.Fatalf("first build: %v", err)
	}
	second, err := buildProposedTagParams(req, db.User{ID: 8})
	if err != nil {
		t.Fatalf("second build: %v", err)
	}
	if first[0].Code == second[0].Code {
		t.Fatalf("different creators unexpectedly share pending code %q", first[0].Code)
	}
}

func TestIssueService_OpenMedia_VisibilityRules(t *testing.T) {
	tempDir := t.TempDir()
	storageMgr, err := storage.NewManager(tempDir)
	if err != nil {
		t.Fatalf("NewManager error: %v", err)
	}

	// Create test media file in storage
	photoPath := filepath.Join(tempDir, "before", "test_photo.jpg")
	if err := os.WriteFile(photoPath, []byte("valid-image-bytes"), 0600); err != nil {
		t.Fatalf("failed to write test photo: %v", err)
	}

	store := newMockIssueStore()
	svc := NewService(store, storageMgr, nil)

	// Seed users
	creator := db.User{ID: 10, Username: "creator", Role: "USER", SiteID: 1, IsActive: true}
	assignee := db.User{ID: 11, Username: "assignee", Role: "USER", SiteID: 1, IsActive: true}
	teamMember := db.User{ID: 12, Username: "teammember", Role: "USER", SiteID: 1, IsActive: true}
	lineLeaderA1 := db.User{
		ID: 13, Username: "leader_a1", Role: "LINE_LEADER", SiteID: 1, IsActive: true,
		AssignedLocationCode: sql.NullString{String: "LINE_A1", Valid: true},
	}
	lineLeaderB1 := db.User{
		ID: 14, Username: "leader_b1", Role: "LINE_LEADER", SiteID: 1, IsActive: true,
		AssignedLocationCode: sql.NullString{String: "LINE_B1", Valid: true},
	}
	safetyOfficer := db.User{ID: 15, Username: "safety", Role: "SAFETY_OFFICER", SiteID: 1, IsActive: true}
	admin := db.User{ID: 16, Username: "admin", Role: "ADMIN", SiteID: 1, IsActive: true}
	superadmin := db.User{ID: 17, Username: "superadmin", Role: "SUPERADMIN", SiteID: 1, IsActive: true}
	otherWorker := db.User{ID: 18, Username: "other", Role: "USER", SiteID: 1, IsActive: true}
	diffSiteWorker := db.User{ID: 19, Username: "diffsite", Role: "USER", SiteID: 2, IsActive: true}

	for _, u := range []db.User{creator, assignee, teamMember, lineLeaderA1, lineLeaderB1, safetyOfficer, admin, superadmin, otherWorker, diffSiteWorker} {
		store.users[u.ID] = u
	}

	// Seed team membership: team 5 -> user 12
	store.memberships[5] = map[int64]struct{}{
		teamMember.ID: {},
	}

	// Issue 1: SITE_PUBLIC (e.g. 1S category)
	store.issues[1] = db.Issue{
		ID:              1,
		ClientUuid:      "c0a80101-0000-4000-8000-000000000001",
		SiteID:          1,
		CreatorID:       creator.ID,
		Category:        "1S",
		VisibilityClass: "SITE_PUBLIC",
		LocationCode:    "LINE_A1",
		PhotoBefore:     "test_photo.jpg",
		Status:          StatusOpen.String(),
	}

	// Issue 2: SAFETY_RESTRICTED (e.g. 6S safety incident)
	store.issues[2] = db.Issue{
		ID:              2,
		ClientUuid:      "c0a80101-0000-4000-8000-000000000002",
		SiteID:          1,
		CreatorID:       creator.ID,
		AssigneeID:      sql.NullInt64{Int64: assignee.ID, Valid: true},
		AssignedTeamID:  sql.NullInt64{Int64: 5, Valid: true},
		Category:        "6S",
		VisibilityClass: "SAFETY_RESTRICTED",
		LocationCode:    "LINE_A1",
		PhotoBefore:     "test_photo.jpg",
		Status:          StatusOpen.String(),
	}

	t.Run("non-existent issue returns ErrIssueNotFound", func(t *testing.T) {
		f, err := svc.OpenMedia(ctxFor(admin), 9999, "before", "test_photo.jpg")
		if err != ErrIssueNotFound {
			t.Fatalf("expected ErrIssueNotFound, got %v", err)
		}
		if f != nil {
			f.Close()
		}
	})

	t.Run("SITE_PUBLIC: same-site users can view, different site is forbidden", func(t *testing.T) {
		// Same site worker can open
		f, err := svc.OpenMedia(ctxFor(otherWorker), 1, "before", "test_photo.jpg")
		if err != nil {
			t.Fatalf("expected same site worker to open media, got %v", err)
		}
		_ = f.Close()

		// Different site worker is forbidden
		_, err = svc.OpenMedia(ctxFor(diffSiteWorker), 1, "before", "test_photo.jpg")
		if !errors.Is(err, ErrMediaForbidden) {
			t.Fatalf("expected ErrMediaForbidden for different site, got %v", err)
		}
	})

	t.Run("SAFETY_RESTRICTED: allowed stakeholders can open", func(t *testing.T) {
		allowedUsers := []db.User{
			creator,
			assignee,
			teamMember,
			lineLeaderA1, // Location matches issue location LINE_A1
			safetyOfficer,
			admin,
			superadmin,
		}

		for _, u := range allowedUsers {
			f, err := svc.OpenMedia(ctxFor(u), 2, "before", "test_photo.jpg")
			if err != nil {
				t.Fatalf("user %s (%s) should be allowed to view restricted media, got: %v", u.Username, u.Role, err)
			}
			_ = f.Close()
		}
	})

	t.Run("SAFETY_RESTRICTED: unauthorized users are forbidden", func(t *testing.T) {
		forbiddenUsers := []db.User{
			otherWorker,  // Plain worker not involved
			lineLeaderB1, // Line leader for LINE_B1, not LINE_A1
			diffSiteWorker,
		}

		for _, u := range forbiddenUsers {
			_, err := svc.OpenMedia(ctxFor(u), 2, "before", "test_photo.jpg")
			if !errors.Is(err, ErrMediaForbidden) {
				t.Fatalf("user %s (%s) should get ErrMediaForbidden, got: %v", u.Username, u.Role, err)
			}
		}
	})
}
