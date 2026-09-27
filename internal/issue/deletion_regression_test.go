package issue

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"6s/internal/auth"
	"6s/internal/db"
)

type deletionRegressionStore struct {
	*mockIssueStore
	getCalls       int
	lifecycleCalls int
}

func (s *deletionRegressionStore) GetIssueByID(ctx context.Context, id int64) (db.Issue, error) {
	s.getCalls++
	return s.mockIssueStore.GetIssueByID(ctx, id)
}

func (s *deletionRegressionStore) DeleteIssueAtomic(_ context.Context, params db.SoftDeleteIssueParams, audit db.InsertAuditLogParams) (db.Issue, error) {
	s.lifecycleCalls++
	issue, ok := s.issues[params.ID]
	if !ok || issue.DeletedAt.Valid || issue.Version != params.Version {
		return db.Issue{}, sql.ErrNoRows
	}
	issue.DeletedAt = sql.NullTime{Time: time.Date(2026, time.September, 26, 8, 0, 0, 0, time.UTC), Valid: true}
	issue.DeletedBy = params.DeletedBy
	issue.DeleteReason = params.DeleteReason
	issue.Version++
	s.issues[issue.ID] = issue
	audit.OldValue = []byte(`{"version":3,"deleted_at":null}`)
	audit.NewValue = []byte(`{"version":4,"deleted_at":"2026-09-26T08:00:00Z"}`)
	s.auditLogs = append(s.auditLogs, audit)
	return issue, nil
}

func (s *deletionRegressionStore) RestoreIssueAtomic(_ context.Context, params db.RestoreIssueParams, audit db.InsertAuditLogParams) (db.Issue, error) {
	s.lifecycleCalls++
	issue, ok := s.issues[params.ID]
	if !ok || !issue.DeletedAt.Valid || issue.Version != params.Version {
		return db.Issue{}, sql.ErrNoRows
	}
	issue.DeletedAt = sql.NullTime{}
	issue.DeletedBy = sql.NullInt64{}
	issue.DeleteReason = sql.NullString{}
	issue.Version++
	s.issues[issue.ID] = issue
	audit.OldValue = []byte(`{"version":4,"deleted_at":"2026-09-26T08:00:00Z"}`)
	audit.NewValue = []byte(`{"version":5,"deleted_at":null}`)
	s.auditLogs = append(s.auditLogs, audit)
	return issue, nil
}

func deletionAdminContext(user db.User, permissions ...string) context.Context {
	return auth.WithPermissions(context.WithValue(context.Background(), auth.UserContextKey, user), permissions)
}

func deletionAdmin() db.User {
	return db.User{ID: 99, Username: "delete-admin", Role: auth.RoleAdmin.String(), SiteID: 10, IsActive: true}
}

func deletionIssue(siteID int64) db.Issue {
	return db.Issue{ID: 7, ClientUuid: "c0a80101-0000-4000-8000-000000000007", Version: 3, SiteID: siteID, CreatorID: 11, Category: "3S", LocationCode: "LINE_A1", PhotoBefore: "before.jpg", Status: StatusOpen.String(), CreatedAt: time.Date(2026, time.January, 2, 8, 0, 0, 0, time.UTC)}
}

func newDeletionRegressionStore(issue db.Issue) *deletionRegressionStore {
	base := newMockIssueStore()
	base.issues[issue.ID] = issue
	return &deletionRegressionStore{mockIssueStore: base}
}

func TestDeleteIssue_RejectsUnauthorizedBeforeLoadingState(t *testing.T) {
	store := newDeletionRegressionStore(deletionIssue(10))
	svc := NewService(store, nil, nil)
	user := db.User{ID: 12, Role: auth.RoleUser.String(), SiteID: 10, IsActive: true}

	_, err := svc.DeleteIssue(deletionAdminContext(user), DeleteIssueRequest{IssueID: 404, Reason: "reason", ExpectedVersion: 3}, user)
	if !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("expected permission denial before state lookup, got %v", err)
	}
	if store.getCalls != 0 {
		t.Fatalf("unauthorized delete loaded issue state %d times", store.getCalls)
	}
}

func TestRestoreIssue_RejectsUnauthorizedBeforeLoadingState(t *testing.T) {
	deleted := deletionIssue(10)
	deleted.DeletedAt = sql.NullTime{Time: time.Date(2026, time.January, 3, 8, 0, 0, 0, time.UTC), Valid: true}
	store := newDeletionRegressionStore(deleted)
	svc := NewService(store, nil, nil)
	user := db.User{ID: 12, Role: auth.RoleUser.String(), SiteID: 10, IsActive: true}

	_, err := svc.RestoreIssue(deletionAdminContext(user), RestoreIssueRequest{IssueID: 404, ExpectedVersion: 3}, user)
	if !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("expected permission denial before state lookup, got %v", err)
	}
	if store.getCalls != 0 {
		t.Fatalf("unauthorized restore loaded issue state %d times", store.getCalls)
	}
}

func TestDeleteIssue_ValidationAndCrossSiteBoundaries(t *testing.T) {
	admin := deletionAdmin()
	permissions := []string{auth.PermissionIssueDelete}
	for _, tc := range []struct {
		name    string
		reason  string
		version int32
		want    error
	}{
		{name: "missing version", reason: "valid", version: 0, want: ErrInvalidExpectedVersion},
		{name: "whitespace reason", reason: " \t\n ", version: 3, want: ErrInvalidDeleteReason},
		{name: "unicode code point limit", reason: strings.Repeat("界", 1001), version: 3, want: ErrInvalidDeleteReason},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newDeletionRegressionStore(deletionIssue(10))
			svc := NewService(store, nil, nil)
			_, err := svc.DeleteIssue(deletionAdminContext(admin, permissions...), DeleteIssueRequest{IssueID: 7, Reason: tc.reason, ExpectedVersion: tc.version}, admin)
			if !errors.Is(err, tc.want) {
				t.Fatalf("expected %v, got %v", tc.want, err)
			}
			if store.getCalls != 0 || store.lifecycleCalls != 0 {
				t.Fatalf("invalid request reached state/mutation: get=%d lifecycle=%d", store.getCalls, store.lifecycleCalls)
			}
		})
	}

	store := newDeletionRegressionStore(deletionIssue(11))
	svc := NewService(store, nil, nil)
	_, err := svc.DeleteIssue(deletionAdminContext(admin, permissions...), DeleteIssueRequest{IssueID: 7, Reason: "wrong site", ExpectedVersion: 3}, admin)
	if !errors.Is(err, ErrIssueNotFound) {
		t.Fatalf("expected cross-site issue to be hidden as not found, got %v", err)
	}
	if store.lifecycleCalls != 0 {
		t.Fatal("cross-site delete mutated issue")
	}
}

func TestDeleteRestoreIssue_RejectStaleAndRepeatedMutations(t *testing.T) {
	admin := deletionAdmin()
	store := newDeletionRegressionStore(deletionIssue(10))
	svc := NewService(store, nil, nil)
	ctx := deletionAdminContext(admin, auth.PermissionIssueDelete, auth.PermissionIssueRestore)

	deleted, err := svc.DeleteIssue(ctx, DeleteIssueRequest{IssueID: 7, Reason: "duplicate record", ExpectedVersion: 3}, admin)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if deleted.Version != 4 || deleted.DeletedAt == nil {
		t.Fatalf("unexpected delete response: %+v", deleted)
	}
	if len(store.auditLogs) != 1 {
		t.Fatalf("expected one delete audit, got %d", len(store.auditLogs))
	}

	if _, err := svc.DeleteIssue(ctx, DeleteIssueRequest{IssueID: 7, Reason: "replay", ExpectedVersion: 4}, admin); !errors.Is(err, ErrIssueConflict) {
		t.Fatalf("repeated delete should conflict, got %v", err)
	}
	if _, err := svc.RestoreIssue(ctx, RestoreIssueRequest{IssueID: 7, ExpectedVersion: 3}, admin); !errors.Is(err, ErrIssueConflict) {
		t.Fatalf("stale restore should conflict, got %v", err)
	}
	if len(store.auditLogs) != 1 || store.lifecycleCalls != 2 {
		t.Fatalf("stale/repeated requests added side effects: audits=%d lifecycle=%d", len(store.auditLogs), store.lifecycleCalls)
	}

	restored, err := svc.RestoreIssue(ctx, RestoreIssueRequest{IssueID: 7, ExpectedVersion: 4}, admin)
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if restored.Version != 5 || restored.DeletedAt != nil {
		t.Fatalf("unexpected restore response: %+v", restored)
	}
	if len(store.auditLogs) != 2 {
		t.Fatalf("expected delete and restore audits, got %d", len(store.auditLogs))
	}
	if _, err := svc.RestoreIssue(ctx, RestoreIssueRequest{IssueID: 7, ExpectedVersion: 5}, admin); !errors.Is(err, ErrIssueConflict) {
		t.Fatalf("repeated restore should conflict, got %v", err)
	}
	if len(store.auditLogs) != 2 || store.lifecycleCalls != 3 {
		t.Fatalf("repeated restore added side effects: audits=%d lifecycle=%d", len(store.auditLogs), store.lifecycleCalls)
	}
}
