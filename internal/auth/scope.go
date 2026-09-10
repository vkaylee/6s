package auth

import (
	"context"
	"database/sql"

	"6s/internal/db"
)

// LocationScopeSource exposes the data needed to compute a user's permitted locations.
type LocationScopeSource interface {
	ListActiveLocationCodesForUser(ctx context.Context, arg db.ListActiveLocationCodesForUserParams) ([]string, error)
}

// Scope describes the locations a user can act on.
type Scope struct {
	// SiteWide means the user can act on every location in their site (SAFETY_OFFICER, ADMIN, SUPERADMIN).
	SiteWide bool
	// LocationCodes is the list of location codes the user can act on directly. Empty when SiteWide is true.
	LocationCodes map[string]struct{}
}

// LocationScope computes the set of location codes a user is allowed to access.
// SUPERADMIN, ADMIN, and SAFETY_OFFICER act site-wide; LINE_LEADER relies on active membership
// and team membership.
func LocationScope(ctx context.Context, store LocationScopeSource, user db.User) (Scope, error) {
	role := user.Role
	if role == RoleSuperadmin.String() || role == RoleAdmin.String() || role == RoleSafetyOfficer.String() {
		return Scope{SiteWide: true}, nil
	}
	var siteID sql.NullInt64
	if user.SiteID != 0 {
		siteID = sql.NullInt64{Int64: user.SiteID, Valid: true}
	}
	codes, err := store.ListActiveLocationCodesForUser(ctx, db.ListActiveLocationCodesForUserParams{
		UserID: user.ID, SiteID: siteID,
	})
	if err != nil {
		return Scope{}, err
	}
	set := make(map[string]struct{}, len(codes))
	for _, c := range codes {
		set[c] = struct{}{}
	}
	return Scope{SiteWide: false, LocationCodes: set}, nil
}

// CanAccessLocation reports whether the user can act on the given location.
func (s Scope) CanAccessLocation(locationCode string) bool {
	if s.SiteWide {
		return true
	}
	_, ok := s.LocationCodes[locationCode]
	return ok
}

// IsEmpty reports whether the scope has no permitted locations.
func (s Scope) IsEmpty() bool {
	return !s.SiteWide && len(s.LocationCodes) == 0
}
