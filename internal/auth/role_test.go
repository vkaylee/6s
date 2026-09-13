package auth

import "testing"

func TestRoleIsValid(t *testing.T) {
	valid := []Role{RoleUser, RoleLineLeader, RoleSafetyOfficer, RoleAdmin, RoleSuperadmin}
	for _, role := range valid {
		if !role.IsValid() {
			t.Errorf("expected %q to be valid", role)
		}
		if role.String() == "" {
			t.Errorf("expected %q to have a string value", role)
		}
	}

	for _, role := range []Role{"", "ROOT", "superadmin"} {
		if role.IsValid() {
			t.Errorf("expected %q to be invalid", role)
		}
	}
}
