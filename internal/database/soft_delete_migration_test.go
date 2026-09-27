package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func applyIssueSoftDeleteDown(t *testing.T, db *sql.DB) error {
	t.Helper()
	body, err := os.ReadFile("migrations/000025_issue_soft_delete.down.sql")
	if err != nil {
		t.Fatalf("read soft-delete down migration: %v", err)
	}
	conn, err := db.Conn(context.Background())
	if err != nil {
		t.Fatalf("reserve migration connection: %v", err)
	}
	defer conn.Close()
	_, err = conn.ExecContext(context.Background(), string(body))
	if err != nil {
		_, _ = conn.ExecContext(context.Background(), "ROLLBACK")
	}
	return err
}

func seedMigrationIssue(t *testing.T, db *sql.DB) (int64, int64) {
	t.Helper()
	ctx := context.Background()
	var siteID int64
	if err := db.QueryRowContext(ctx, `SELECT id FROM sites ORDER BY id LIMIT 1`).Scan(&siteID); err != nil {
		t.Fatalf("find migration test site: %v", err)
	}
	var locationCode string
	locationCode = fmt.Sprintf("MIGRATION_%d", time.Now().UnixNano())
	if _, err := db.ExecContext(ctx, `INSERT INTO locations (code, name_vi, name_zh, name_en, qr_code, site_id) VALUES ($1, 'Migration Test', 'Migration Test', 'Migration Test', $2, $3)`, locationCode, locationCode, siteID); err != nil {
		t.Fatalf("insert migration test location: %v", err)
	}
	var userID int64
	err := db.QueryRowContext(ctx, `
		INSERT INTO users (username, full_name, role, site_id)
		VALUES ($1, 'Migration Test Admin', 'ADMIN', $2)
		RETURNING id`, fmt.Sprintf("migration-delete-%d", time.Now().UnixNano()), siteID).Scan(&userID)
	if err != nil {
		t.Fatalf("insert migration test user: %v", err)
	}
	var issueID int64
	err = db.QueryRowContext(ctx, `
		INSERT INTO issues (client_uuid, creator_id, category, location_code, photo_before, site_id, visibility_class)
		VALUES ($1, $2, '3S', $3, 'before.jpg', $4, 'SITE_PUBLIC')
		RETURNING id`, fmt.Sprintf("00000000-0000-4000-8000-%012d", time.Now().UnixNano()%1000000000000), userID, locationCode, siteID).Scan(&issueID)
	if err != nil {
		t.Fatalf("insert migration test issue: %v", err)
	}
	return issueID, userID
}

func TestPostgresSoftDeleteDownGuardIsAtomicForDeletedIssue(t *testing.T) {
	db := migrationTestDB(t)
	ctx := context.Background()
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	issueID, userID := seedMigrationIssue(t, db)
	if _, err := db.ExecContext(ctx, `UPDATE issues SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $2, delete_reason = 'rollback guard' WHERE id = $1`, issueID, userID); err != nil {
		t.Fatalf("mark issue deleted: %v", err)
	}

	if err := applyIssueSoftDeleteDown(t, db); err == nil || !strings.Contains(err.Error(), "deleted issues remain") {
		t.Fatalf("expected deleted-issue rollback guard, got %v", err)
	}
	var deletedAt sql.NullTime
	if err := db.QueryRowContext(ctx, `SELECT deleted_at FROM issues WHERE id = $1`, issueID).Scan(&deletedAt); err != nil {
		t.Fatalf("read guarded issue: %v", err)
	}
	if !deletedAt.Valid {
		t.Fatal("failed down migration removed deleted metadata despite guard")
	}
	var hasConstraint bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issues_delete_metadata_check')`).Scan(&hasConstraint); err != nil {
		t.Fatalf("inspect metadata check: %v", err)
	}
	if !hasConstraint {
		t.Fatal("failed down migration removed metadata CHECK")
	}
}

func TestPostgresSoftDeleteDownGuardIsAtomicForCancelledOutbox(t *testing.T) {
	db := migrationTestDB(t)
	ctx := context.Background()
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	issueID, _ := seedMigrationIssue(t, db)
	if _, err := db.ExecContext(ctx, `
		INSERT INTO notification_outbox (issue_id, event_type, channel, payload, status)
		VALUES ($1, 'ISSUE_CREATED', 'TEST', '{}'::jsonb, 'CANCELLED')`, issueID); err != nil {
		t.Fatalf("insert cancelled outbox row: %v", err)
	}

	if err := applyIssueSoftDeleteDown(t, db); err == nil || !strings.Contains(err.Error(), "cancelled outbox rows remain") {
		t.Fatalf("expected cancelled-outbox rollback guard, got %v", err)
	}
	var status string
	if err := db.QueryRowContext(ctx, `SELECT status FROM notification_outbox WHERE issue_id = $1`, issueID).Scan(&status); err != nil {
		t.Fatalf("read guarded outbox: %v", err)
	}
	if status != "CANCELLED" {
		t.Fatalf("failed down migration changed cancelled outbox status to %q", status)
	}
	var hasColumn bool
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'deleted_at')`).Scan(&hasColumn); err != nil {
		t.Fatalf("inspect deleted_at column: %v", err)
	}
	if !hasColumn {
		t.Fatal("failed down migration dropped deleted_at before cancelled-outbox guard")
	}
}

func TestPostgresSoftDeleteDownRestoresOutboxCheck(t *testing.T) {
	db := migrationTestDB(t)
	ctx := context.Background()
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	issueID, _ := seedMigrationIssue(t, db)
	if _, err := db.ExecContext(ctx, `DELETE FROM notification_outbox WHERE issue_id = $1`, issueID); err != nil {
		t.Fatalf("clear test outbox: %v", err)
	}
	if err := applyIssueSoftDeleteDown(t, db); err != nil {
		t.Fatalf("clean soft-delete down migration: %v", err)
	}
	_, err := db.ExecContext(ctx, `
		INSERT INTO notification_outbox (issue_id, event_type, channel, payload, status)
		VALUES ($1, 'ISSUE_CREATED', 'TEST', '{}'::jsonb, 'CANCELLED')`, issueID)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "check constraint") {
		t.Fatalf("expected restored outbox status CHECK to reject CANCELLED, got %v", err)
	}
}
