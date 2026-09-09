package auth

// Role represents a system user role.
type Role string

// Predefined system user roles.
const (
	// RoleUser represents regular factory operators.
	RoleUser Role = "USER"
	// RoleLineLeader represents production line managers.
	RoleLineLeader Role = "LINE_LEADER"
	// RoleSafetyOfficer represents factory safety specialists.
	RoleSafetyOfficer Role = "SAFETY_OFFICER"
	// RoleAdmin represents system administrators.
	RoleAdmin Role = "ADMIN"
	// RoleSuperadmin represents the highest-privilege system administrator.
	RoleSuperadmin Role = "SUPERADMIN"
)

// String returns string representation of Role.
func (r Role) String() string {
	return string(r)
}

// IsValid checks if role is recognized.
func (r Role) IsValid() bool {
	switch r {
	case RoleUser, RoleLineLeader, RoleSafetyOfficer, RoleAdmin, RoleSuperadmin:
		return true
	default:
		return false
	}
}
