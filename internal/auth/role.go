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

// Source identifies the identity provider for a user.
type Source string

// Supported identity provider sources.
const (
	SourceLocal Source = "LOCAL"
	SourceAD    Source = "AD"
)

func (s Source) String() string { return string(s) }

// IsValid reports whether s is a recognized identity provider source.
func (s Source) IsValid() bool { return s == SourceLocal || s == SourceAD }

// ResponsibilityType identifies a user's location responsibility.
type ResponsibilityType string

// Supported location responsibility types.
const (
	ResponsibilityOwner    ResponsibilityType = "OWNER"
	ResponsibilityBackup   ResponsibilityType = "BACKUP"
	ResponsibilityReviewer ResponsibilityType = "REVIEWER"
)

func (r ResponsibilityType) String() string { return string(r) }

// IsValid reports whether r is a recognized location responsibility type.
func (r ResponsibilityType) IsValid() bool {
	return r == ResponsibilityOwner || r == ResponsibilityBackup || r == ResponsibilityReviewer
}
