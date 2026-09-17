package auth

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"6s/internal/db"
)

func TestJITProvisionResolvesByDNAndPreservesRoleAndSite(t *testing.T) {
	store := newMockFullStore()
	existing := db.User{
		ID: 42, Username: "renamed", AuthSource: "AD",
		AdDn: sql.NullString{String: "CN=User,DC=factory,DC=lan", Valid: true},
		Role: RoleAdmin.String(), SiteID: 7, IsActive: true,
	}
	store.users[existing.ID] = existing
	store.usersByName[existing.Username] = existing
	h := &Handler{store: store}

	got, err := h.jitProvisionUser(context.Background(), "new-login", &LDAPUser{
		Username: "renamed-now", DN: " cn=user,dc=factory,dc=lan ", FullName: "Updated", MatchedRole: RoleUser.String(),
	})
	if err != nil {
		t.Fatalf("JIT lookup by DN: %v", err)
	}
	if got.ID != existing.ID || got.Role != existing.Role || got.SiteID != existing.SiteID {
		t.Fatalf("JIT changed identity attributes: got id=%d role=%q site=%d", got.ID, got.Role, got.SiteID)
	}
}

func TestJITProvisionRejectsLocalUsernameHijack(t *testing.T) {
	store := newMockFullStore()
	local := db.User{ID: 1, Username: "jdoe", AuthSource: "LOCAL", Role: RoleAdmin.String(), SiteID: 3, IsActive: true}
	store.users[local.ID] = local
	store.usersByName[local.Username] = local
	h := &Handler{store: store}

	_, err := h.jitProvisionUser(context.Background(), "jdoe", &LDAPUser{Username: "jdoe", DN: "CN=Different,DC=factory,DC=lan", FullName: "AD", MatchedRole: RoleUser.String()})
	if !errors.Is(err, errIdentityCollision) {
		t.Fatalf("expected local identity collision, got %v", err)
	}
	if len(store.jitArgs) != 0 {
		t.Fatal("local username collision must not create JIT user")
	}
}

func TestJITProvisionRejectsMissingDN(t *testing.T) {
	h := &Handler{store: newMockFullStore()}
	_, err := h.jitProvisionUser(context.Background(), "jdoe", &LDAPUser{Username: "jdoe"})
	if !errors.Is(err, errInvalidADIdentity) {
		t.Fatalf("expected missing DN error, got %v", err)
	}
}

func TestJITProvisionExistingADByUsernameRequiresMatchingDN(t *testing.T) {
	store := newMockFullStore()
	existing := db.User{ID: 4, Username: "jdoe", AuthSource: "AD", AdDn: sql.NullString{String: "CN=Other,DC=factory,DC=lan", Valid: true}, Role: RoleAdmin.String(), IsActive: true}
	store.users[existing.ID] = existing
	store.usersByName[existing.Username] = existing
	_, err := (&Handler{store: store}).jitProvisionUser(context.Background(), "jdoe", &LDAPUser{Username: "jdoe", DN: "CN=New,DC=factory,DC=lan"})
	if !errors.Is(err, errIdentityCollision) {
		t.Fatalf("expected mismatched AD DN collision, got %v", err)
	}
}
