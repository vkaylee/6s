package auth

import (
	"context"
	"net/http"

	"6s/internal/apperror"
	"6s/internal/i18n"
	"6s/internal/response"
)

// Permission catalog codes (v1). Seeded by migration 000009.
const (
	PermissionIssueCreate      = "issue:create"
	PermissionIssueViewAll     = "issue:view_all"
	PermissionIssueResolve     = "issue:resolve"
	PermissionIssueCloseOwn    = "issue:close_own"
	PermissionIssueCloseLine   = "issue:close_line"
	PermissionIssueCloseAny    = "issue:close_any"
	PermissionIssueCloseSafety = "issue:close_safety"
	PermissionIssueReopen      = "issue:reopen"
	PermissionIssueInvalidate  = "issue:invalidate"
	PermissionScoringManage    = "scoring:manage"
	PermissionADManage         = "ad:manage"
	PermissionUserManage       = "user:manage"
	PermissionManage           = "permission:manage"
	PermissionMasterdataManage = "masterdata:manage"
)

type permissionContextKey struct{}

// PermissionGetter loads effective permissions for a user from role_permissions.
type PermissionGetter interface {
	GetUserPermissions(ctx context.Context, id int64) ([]string, error)
}

// WithPermissions attaches effective permissions to a trusted request context.
// Middleware is the production source; tests use this helper to exercise policies.
func WithPermissions(ctx context.Context, permissions []string) context.Context {
	set := make(map[string]struct{}, len(permissions))
	for _, p := range permissions {
		set[p] = struct{}{}
	}
	return context.WithValue(ctx, permissionContextKey{}, set)
}

// HasPermission reports whether the authenticated request carries an exact permission.
// Missing context fails closed.
func HasPermission(ctx context.Context, code string) bool {
	if code == "" {
		return false
	}
	permissions, ok := ctx.Value(permissionContextKey{}).(map[string]struct{})
	if !ok {
		return false
	}
	_, ok = permissions[code]
	return ok
}

// RequirePermission protects a route with a permission loaded during authentication.
func RequirePermission(code string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if _, ok := GetUserFromContext(r.Context()); !ok {
				_ = response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
				return
			}
			if !HasPermission(r.Context(), code) {
				_ = response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
