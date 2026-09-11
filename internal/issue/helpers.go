package issue

import (
	"6s/internal/auth"
	"6s/internal/db"
	"context"
	"database/sql"
)

func expectedVersion(version *int32) sql.NullInt32 {
	if version == nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: *version, Valid: true}
}

func isValidCategory(c string) bool {
	return Category(c).IsValid()
}

func userFromContext(ctx context.Context) db.User {
	if user, ok := auth.GetUserFromContext(ctx); ok {
		return user
	}
	return db.User{}
}

func visibilityForCategory(category string) string {
	if category == Category6S.String() {
		return "SAFETY_RESTRICTED"
	}
	return "SITE_PUBLIC"
}
