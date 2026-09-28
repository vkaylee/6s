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

func TestAuthSourceAndResponsibilityIsValid(t *testing.T) {
	for _, source := range []AuthSource{AuthSourceLocal, AuthSourceAD} {
		if !source.IsValid() || source.String() == "" {
			t.Errorf("expected auth source %q to be valid", source)
		}
	}
	if AuthSource("LDAP").IsValid() {
		t.Error("expected unknown auth source to be invalid")
	}
	for _, responsibility := range []ResponsibilityType{ResponsibilityOwner, ResponsibilityBackup, ResponsibilityReviewer} {
		if !responsibility.IsValid() || responsibility.String() == "" {
			t.Errorf("expected responsibility %q to be valid", responsibility)
		}
	}
	if ResponsibilityType("LEAD").IsValid() {
		t.Error("expected unknown responsibility to be invalid")
	}
}
