package database

import (
	"strings"
	"testing"

	"6s/internal/auth"
)

func TestRoleMigrationConstraintMatchesGoRoles(t *testing.T) {
	migration, err := migrationsFS.ReadFile("migrations/000011_superadmin.up.sql")
	if err != nil {
		t.Fatalf("read role migration: %v", err)
	}

	roles := []auth.Role{
		auth.RoleUser,
		auth.RoleLineLeader,
		auth.RoleSafetyOfficer,
		auth.RoleAdmin,
		auth.RoleSuperadmin,
	}
	for _, role := range roles {
		if !strings.Contains(string(migration), "'"+role.String()+"'") {
			t.Errorf("role migration does not include %q", role)
		}
	}
}
