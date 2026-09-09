package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"6s/internal/apperror"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// PermissionStore defines persistence operations for permission administration.
type PermissionStore interface {
	ListPermissions(context.Context) ([]db.Permission, error)
	ListRolePermissions(context.Context) ([]db.RolePermission, error)
	ReplaceRolePermissionsAndAudit(context.Context, db.ReplaceRolePermissionsParams, db.InsertAuditLogParams) error
}

// PermissionHandler serves permission administration endpoints.
type PermissionHandler struct{ store PermissionStore }

// NewPermissionHandler constructs a permission administration handler.
func NewPermissionHandler(store PermissionStore) *PermissionHandler {
	return &PermissionHandler{store: store}
}

type permissionRoleResponse struct {
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

type permissionResponse struct {
	Code        string `json:"code"`
	Description string `json:"description"`
}

type permissionsResponse struct {
	Permissions []permissionResponse     `json:"permissions"`
	Roles       []permissionRoleResponse `json:"roles"`
}

var permissionRoles = []string{RoleUser.String(), RoleLineLeader.String(), RoleSafetyOfficer.String(), RoleAdmin.String(), RoleSuperadmin.String()}

// List returns the permission catalog and role assignments.
func (h *PermissionHandler) List(w http.ResponseWriter, r *http.Request) {
	actor, ok := GetUserFromContext(r.Context())
	if !ok || actor.Role != RoleSuperadmin.String() {
		_ = response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
		return
	}
	permissions, err := h.store.ListPermissions(r.Context())
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	pairs, err := h.store.ListRolePermissions(r.Context())
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	byRole := make(map[string][]string, len(permissionRoles))
	for _, role := range permissionRoles {
		byRole[role] = []string{}
	}
	for _, pair := range pairs {
		byRole[pair.Role] = append(byRole[pair.Role], pair.PermissionCode)
	}
	items := make([]permissionResponse, 0, len(permissions))
	for _, permission := range permissions {
		items = append(items, permissionResponse{Code: permission.Code, Description: permission.Description})
	}
	result := permissionsResponse{Permissions: items, Roles: make([]permissionRoleResponse, 0, len(permissionRoles))}
	for _, role := range permissionRoles {
		sort.Strings(byRole[role])
		result.Roles = append(result.Roles, permissionRoleResponse{Role: role, Permissions: byRole[role]})
	}
	_ = response.JSON(w, http.StatusOK, result)
}

// UpdateRole replaces one role's permission assignments.
func (h *PermissionHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	actor, ok := GetUserFromContext(r.Context())
	if !ok || actor.Role != RoleSuperadmin.String() {
		_ = response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
		return
	}
	role := chi.URLParam(r, "role")
	if !Role(role).IsValid() {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "invalid role"))
		return
	}
	var req struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	catalog, err := h.store.ListPermissions(r.Context())
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	valid := make(map[string]bool, len(catalog))
	system := make(map[string]bool, len(catalog))
	for _, permission := range catalog {
		valid[permission.Code] = true
		system[permission.Code] = permission.IsSystem
	}
	seen := make(map[string]bool, len(req.Permissions))
	for _, code := range req.Permissions {
		if !valid[code] || seen[code] {
			_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "invalid or duplicate permission"))
			return
		}
		seen[code] = true
	}
	if role == RoleSuperadmin.String() {
		_ = response.AppError(w, r, apperror.Conflict("SUPERADMIN_LOCKED", i18n.ErrPermissionLockout))
		return
	}
	if role == RoleAdmin.String() {
		if !seen[PermissionManage] || !seen[PermissionUserManage] {
			_ = response.AppError(w, r, apperror.Conflict("ADMIN_LOCKOUT", i18n.ErrPermissionLockout))
			return
		}
		for code, isSystem := range system {
			if isSystem && !seen[code] {
				_ = response.AppError(w, r, apperror.Conflict("SYSTEM_PERMISSION", i18n.ErrPermissionSystemRequired))
				return
			}
		}
	}
	oldPairs, err := h.store.ListRolePermissions(r.Context())
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	old := []string{}
	for _, pair := range oldPairs {
		if pair.Role == role {
			old = append(old, pair.PermissionCode)
		}
	}
	sort.Strings(old)
	oldJSON, _ := json.Marshal(permissionRoleResponse{Role: role, Permissions: old})
	newJSON, _ := json.Marshal(permissionRoleResponse{Role: role, Permissions: req.Permissions})
	audit := db.InsertAuditLogParams{
		UserID: sql.NullInt64{Int64: actor.ID, Valid: actor.ID != 0},
		Action: "ADMIN_UPDATE_ROLE_PERMISSIONS", TargetTable: "role_permissions", TargetID: role,
		OldValue: oldJSON, NewValue: newJSON,
		IpAddress: sql.NullString{String: clientIP(r), Valid: true}, UserAgent: sql.NullString{String: r.UserAgent(), Valid: true},
	}
	if err := h.store.ReplaceRolePermissionsAndAudit(r.Context(), db.ReplaceRolePermissionsParams{Role: role, Column2: req.Permissions}, audit); err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrPermissionSaveFailed).WithCause(err))
		return
	}
	_ = response.JSON(w, http.StatusOK, permissionRoleResponse{Role: role, Permissions: req.Permissions})

}

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return ip
	}
	return r.RemoteAddr
}
