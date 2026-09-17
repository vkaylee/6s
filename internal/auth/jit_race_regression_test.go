package auth

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"6s/internal/db"
)

type jitConflictStore struct {
	*mockFullStore
	reload  []db.User
	dnCalls int
}

func (s *jitConflictStore) CreateUserJIT(context.Context, db.CreateUserJITParams) (db.User, error) {
	return db.User{}, &pgconn.PgError{Code: "23505", ConstraintName: "users_ad_dn_key"}
}

func (s *jitConflictStore) GetUsersByADDN(_ context.Context, _ string) ([]db.User, error) {
	s.dnCalls++
	if s.dnCalls == 1 {
		return nil, sql.ErrNoRows
	}
	return s.reload, nil
}

func TestJITProvisionUniqueConflictReloadsMatchingADIdentity(t *testing.T) {
	store := &jitConflictStore{mockFullStore: newMockFullStore()}
	existing := db.User{
		ID: 21, Username: "same-user", AuthSource: "AD",
		AdDn:     sql.NullString{String: "CN=Same,DC=factory,DC=lan", Valid: true},
		FullName: "Before", Role: RoleAdmin.String(), SiteID: 9, IsActive: true,
	}
	store.users[existing.ID] = existing
	store.usersByName[existing.Username] = existing
	store.reload = []db.User{existing}

	got, err := (&Handler{store: store}).jitProvisionUser(context.Background(), "same-user", &LDAPUser{
		Username: "same-user", DN: existing.AdDn.String, FullName: "After", MatchedRole: RoleUser.String(),
	})
	if err != nil {
		t.Fatalf("expected matching concurrent identity to succeed: %v", err)
	}
	if got.ID != existing.ID || got.Role != existing.Role || got.SiteID != existing.SiteID || got.FullName != "After" {
		t.Fatalf("unexpected reloaded user: id=%d role=%q site=%d name=%q", got.ID, got.Role, got.SiteID, got.FullName)
	}
}

func TestJITProvisionUniqueConflictRejectsMismatchedReload(t *testing.T) {
	store := &jitConflictStore{mockFullStore: newMockFullStore(), reload: []db.User{{
		ID: 22, Username: "other", AuthSource: "AD",
		AdDn: sql.NullString{String: "CN=Other,DC=factory,DC=lan", Valid: true}, Role: RoleAdmin.String(), SiteID: 9,
	}}}
	_, err := (&Handler{store: store}).jitProvisionUser(context.Background(), "new-user", &LDAPUser{Username: "new-user", DN: "CN=New,DC=factory,DC=lan"})
	if !errors.Is(err, errIdentityCollision) {
		t.Fatalf("expected mismatched reload collision, got %v", err)
	}
}

func TestJITProvisionUniqueConflictRejectsMissingReload(t *testing.T) {
	store := &jitConflictStore{mockFullStore: newMockFullStore()}
	_, err := (&Handler{store: store}).jitProvisionUser(context.Background(), "missing-user", &LDAPUser{Username: "missing-user", DN: "CN=Missing,DC=factory,DC=lan"})
	if !errors.Is(err, errIdentityCollision) {
		t.Fatalf("expected missing concurrent identity collision, got %v", err)
	}
}
