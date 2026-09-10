package auth

import (
	"context"
	"testing"

	"6s/internal/db"
)

type stubScopeStore struct{ codes []string }

func (s *stubScopeStore) ListActiveLocationCodesForUser(_ context.Context, arg db.ListActiveLocationCodesForUserParams) ([]string, error) {
	if arg.UserID == 4 {
		return s.codes, nil
	}
	return nil, nil
}

func TestLocationScope(t *testing.T) {
	store := &stubScopeStore{codes: []string{"LINE_A1", "LINE_A2"}}
	cases := []struct {
		name   string
		user   db.User
		wide   bool
		access map[string]bool
	}{
		{"superadmin", db.User{ID: 1, Role: RoleSuperadmin.String()}, true, map[string]bool{"LINE_B1": true}},
		{"admin", db.User{ID: 2, Role: RoleAdmin.String()}, true, map[string]bool{"LINE_B1": true}},
		{"safety officer", db.User{ID: 3, Role: RoleSafetyOfficer.String()}, true, map[string]bool{"LINE_B1": true}},
		{"line leader", db.User{ID: 4, Role: RoleLineLeader.String()}, false, map[string]bool{"LINE_A1": true, "LINE_B1": false}},
		{"user", db.User{ID: 5, Role: RoleUser.String()}, false, map[string]bool{"LINE_A1": false}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			scope, err := LocationScope(context.Background(), store, tc.user)
			if err != nil {
				t.Fatal(err)
			}
			if scope.SiteWide != tc.wide {
				t.Errorf("SiteWide = %v, want %v", scope.SiteWide, tc.wide)
			}
			for location, want := range tc.access {
				if got := scope.CanAccessLocation(location); got != want {
					t.Errorf("access %s = %v, want %v", location, got, want)
				}
			}
		})
	}
}

func TestLocationScopeEmpty(t *testing.T) {
	scope, err := LocationScope(context.Background(), &stubScopeStore{}, db.User{ID: 7, Role: RoleLineLeader.String()})
	if err != nil {
		t.Fatal(err)
	}
	if !scope.IsEmpty() || scope.CanAccessLocation("ANY") {
		t.Fatal("expected empty denied scope")
	}
}

type captureScopeStore struct {
	out *db.ListActiveLocationCodesForUserParams
}

func (s *captureScopeStore) ListActiveLocationCodesForUser(_ context.Context, arg db.ListActiveLocationCodesForUserParams) ([]string, error) {
	*s.out = arg
	return nil, nil
}

func TestLocationScopePassesSite(t *testing.T) {
	var captured db.ListActiveLocationCodesForUserParams
	_, err := LocationScope(context.Background(), &captureScopeStore{out: &captured}, db.User{ID: 8, Role: RoleLineLeader.String(), SiteID: 3})
	if err != nil {
		t.Fatal(err)
	}
	if !captured.SiteID.Valid || captured.SiteID.Int64 != 3 {
		t.Fatalf("unexpected site ID: %+v", captured.SiteID)
	}
}
