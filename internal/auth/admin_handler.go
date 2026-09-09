package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"6s/internal/apperror"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// AdminStore defines persistence operations for user administration.
type AdminStore interface {
	ListUsers(ctx context.Context, arg db.ListUsersParams) ([]db.User, error)
	GetUserByID(ctx context.Context, id int64) (db.User, error)
	UpdateUserAdmin(ctx context.Context, arg db.UpdateUserAdminParams) (db.User, error)
	GetLocationByCode(ctx context.Context, code string) (db.Location, error)
	CountAdmins(ctx context.Context) (int64, error)
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
	RevokeUserRefreshTokens(ctx context.Context, userID int64) error
}

type atomicAdminStore interface {
	UpdateUserAdminAtomic(ctx context.Context, update db.UpdateUserAdminParams, revoke bool, audit db.InsertAuditLogParams) (db.User, error)
}

// AdminHandler manages user role/location/status administration (Admin only).
type AdminHandler struct {
	store AdminStore
}

// NewAdminHandler creates a new AdminHandler.
func NewAdminHandler(store AdminStore) *AdminHandler {
	return &AdminHandler{store: store}
}

// AdminUserResponse is the safe user projection for administration listings.
// Never exposes password_hash, pin_hash, ad_dn, or wx_uid.
type AdminUserResponse struct {
	ID                   int64   `json:"id"`
	Username             string  `json:"username"`
	AuthSource           string  `json:"auth_source"`
	FullName             string  `json:"full_name"`
	Email                *string `json:"email"`
	Role                 string  `json:"role"`
	AssignedLocationCode *string `json:"assigned_location_code"`
	IsActive             bool    `json:"is_active"`
	CreatedAt            string  `json:"created_at"`
	LastLoginAt          *string `json:"last_login_at"`
}

func toAdminUserResponse(u db.User) AdminUserResponse {
	resp := AdminUserResponse{
		ID:         u.ID,
		Username:   u.Username,
		AuthSource: u.AuthSource,
		FullName:   u.FullName,
		Role:       u.Role,
		IsActive:   u.IsActive,
		CreatedAt:  u.CreatedAt.Format("2006-01-02 15:04"),
	}
	if u.Email.Valid {
		resp.Email = &u.Email.String
	}
	if u.AssignedLocationCode.Valid {
		resp.AssignedLocationCode = &u.AssignedLocationCode.String
	}
	if u.LastLoginAt.Valid {
		s := u.LastLoginAt.Time.Format("2006-01-02 15:04")
		resp.LastLoginAt = &s
	}
	return resp
}

// ListUsers handles GET /api/admin/users (Admin only).
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	params := db.ListUsersParams{}
	if v := r.URL.Query().Get("assigned_location_code"); v != "" {
		params.AssignedLocationCode = sql.NullString{String: v, Valid: true}
	}
	if v := r.URL.Query().Get("is_active"); v == "true" || v == "false" {
		params.IsActive = sql.NullBool{Bool: v == "true", Valid: true}
	}

	users, err := h.store.ListUsers(r.Context(), params)
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}

	items := make([]AdminUserResponse, 0, len(users))
	for _, u := range users {
		items = append(items, toAdminUserResponse(u))
	}
	_ = response.JSON(w, http.StatusOK, items)
}

// UpdateUserRequest payload to update role, assigned location, active status.
// Pointer fields: nil = keep current value.
type UpdateUserRequest struct {
	Role                 *string `json:"role,omitempty"`
	AssignedLocationCode *string `json:"assigned_location_code,omitempty"`
	IsActive             *bool   `json:"is_active,omitempty"`
}

func (h *AdminHandler) clientIP(r *http.Request) string {
	ip := r.Header.Get("X-Real-IP")
	if ip == "" {
		ip = r.Header.Get("X-Forwarded-For")
	}
	if ip == "" {
		ip = r.RemoteAddr
	}
	return ip
}

func (h *AdminHandler) updateParams(ctx context.Context, target db.User, req UpdateUserRequest) (db.UpdateUserAdminParams, *apperror.AppError) {
	params := db.UpdateUserAdminParams{ID: target.ID, Role: target.Role, IsActive: target.IsActive}
	if req.Role != nil {
		role := Role(*req.Role)
		if !role.IsValid() {
			return params, apperror.BadRequest(i18n.ErrInvalidInput, "invalid role")
		}
		params.Role = role.String()
	}
	if req.AssignedLocationCode == nil {
		return params, nil
	}
	if *req.AssignedLocationCode == "" {
		params.AssignedLocationCode = sql.NullString{Valid: false}
		return params, nil
	}
	if _, err := h.store.GetLocationByCode(ctx, *req.AssignedLocationCode); err != nil {
		if err == sql.ErrNoRows {
			return params, apperror.BadRequest(i18n.ErrInvalidInput, "unknown location code")
		}
		return params, apperror.Internal(i18n.ErrLocationQueryFailed).WithCause(err)
	}
	params.AssignedLocationCode = sql.NullString{String: *req.AssignedLocationCode, Valid: true}
	return params, nil
}

func (h *AdminHandler) ensureAdminCount(ctx context.Context) *apperror.AppError {
	count, err := h.store.CountAdmins(ctx)
	if err != nil {
		return apperror.Internal(i18n.ErrUserQuery).WithCause(err)
	}
	if count <= 1 {
		return apperror.Conflict("LAST_ADMIN", i18n.ErrLastAdmin)
	}
	return nil
}

func (h *AdminHandler) ensureSuperadminCount(ctx context.Context) *apperror.AppError {
	users, err := h.store.ListUsers(ctx, db.ListUsersParams{})
	if err != nil {
		return apperror.Internal(i18n.ErrUserQuery).WithCause(err)
	}
	count := 0
	for _, user := range users {
		if user.Role == RoleSuperadmin.String() && user.IsActive {
			count++
		}
	}
	if count <= 1 {
		return apperror.Conflict("LAST_SUPERADMIN", i18n.ErrLastAdmin)
	}
	return nil
}

func (h *AdminHandler) ensureAdminCanChange(ctx context.Context, target db.User, req UpdateUserRequest, params db.UpdateUserAdminParams) *apperror.AppError {
	if target.Role == RoleSuperadmin.String() && target.IsActive &&
		((req.IsActive != nil && !*req.IsActive) || (req.Role != nil && params.Role != RoleSuperadmin.String())) {
		return h.ensureSuperadminCount(ctx)
	}
	if target.Role == RoleAdmin.String() && target.IsActive &&
		((req.IsActive != nil && !*req.IsActive) || (req.Role != nil && params.Role != RoleAdmin.String())) {
		return h.ensureAdminCount(ctx)
	}
	return nil
}

func (h *AdminHandler) authorizeUserChange(actor db.User, target db.User, req UpdateUserRequest, params db.UpdateUserAdminParams) *apperror.AppError {
	if actor.ID == 0 {
		return nil
	}
	if actor.ID == target.ID {
		return apperror.Forbidden(i18n.ErrForbidden)
	}
	if actor.Role != RoleSuperadmin.String() &&
		(target.Role == RoleAdmin.String() || target.Role == RoleSuperadmin.String()) {
		return apperror.Forbidden(i18n.ErrForbidden)
	}
	if actor.Role != RoleSuperadmin.String() && params.Role == RoleSuperadmin.String() {
		return apperror.Forbidden(i18n.ErrForbidden)
	}
	if actor.Role != RoleSuperadmin.String() && req.Role != nil && params.Role == RoleAdmin.String() {
		return apperror.Forbidden(i18n.ErrForbidden)
	}
	return nil
}
func (h *AdminHandler) revokeChangedSessions(ctx context.Context, id int64, target db.User, req UpdateUserRequest, params db.UpdateUserAdminParams) error {
	if req.Role != nil && params.Role != target.Role {
		if err := h.store.RevokeUserRefreshTokens(ctx, id); err != nil {
			return err
		}
	}
	if req.IsActive != nil && !*req.IsActive && target.IsActive {
		if err := h.store.RevokeUserRefreshTokens(ctx, id); err != nil {
			return err
		}
	}
	return nil
}
func (h *AdminHandler) userAuditParams(r *http.Request, actor db.User, id int64, target, updated db.User) (db.InsertAuditLogParams, error) {
	oldJSON, err := json.Marshal(toAdminUserResponse(target))
	if err != nil {
		return db.InsertAuditLogParams{}, err
	}
	newJSON, err := json.Marshal(toAdminUserResponse(updated))
	if err != nil {
		return db.InsertAuditLogParams{}, err
	}
	return db.InsertAuditLogParams{
		UserID: sql.NullInt64{Int64: actor.ID, Valid: actor.ID != 0}, Action: "ADMIN_UPDATE_USER", TargetTable: "users", TargetID: fmt.Sprintf("%d", id),
		OldValue: oldJSON, NewValue: newJSON, IpAddress: sql.NullString{String: h.clientIP(r), Valid: true}, UserAgent: sql.NullString{String: r.UserAgent(), Valid: true},
	}, nil
}

func (h *AdminHandler) auditUserUpdate(ctx context.Context, r *http.Request, actor db.User, id int64, target, updated db.User) error {
	audit, err := h.userAuditParams(r, actor, id, target, updated)
	if err != nil {
		return err
	}
	return h.store.InsertAuditLog(ctx, audit)
}

// UpdateUser handles PATCH /api/admin/users/{id}.
func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}

	var req UpdateUserRequest
	if decodeErr := json.NewDecoder(r.Body).Decode(&req); decodeErr != nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(decodeErr))
		return
	}
	if req.Role == nil && req.AssignedLocationCode == nil && req.IsActive == nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "no fields to update"))
		return
	}

	actor, _ := GetUserFromContext(r.Context())
	target, err := h.store.GetUserByID(r.Context(), id)
	if err != nil {
		if err == sql.ErrNoRows {
			_ = response.AppError(w, r, apperror.NotFound(i18n.ErrUserNotFound))
			return
		}
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}

	params, appErr := h.updateParams(r.Context(), target, req)
	if appErr != nil {
		_ = response.AppError(w, r, appErr)
		return
	}
	if appErr := h.authorizeUserChange(actor, target, req, params); appErr != nil {
		_ = response.AppError(w, r, appErr)
		return
	}
	if appErr := h.ensureAdminCanChange(r.Context(), target, req, params); appErr != nil {
		_ = response.AppError(w, r, appErr)
		return
	}
	if req.IsActive != nil {
		params.IsActive = *req.IsActive
	}
	shouldRevoke := (req.Role != nil && params.Role != target.Role) || (req.IsActive != nil && !*req.IsActive && target.IsActive)
	predicted := target
	predicted.Role = params.Role
	predicted.IsActive = params.IsActive
	if params.AssignedLocationCode.Valid {
		predicted.AssignedLocationCode = params.AssignedLocationCode
	}
	audit, auditErr := h.userAuditParams(r, actor, id, target, predicted)
	if auditErr != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(auditErr))
		return
	}
	var updated db.User
	if atomicStore, ok := h.store.(atomicAdminStore); ok {
		updated, err = atomicStore.UpdateUserAdminAtomic(r.Context(), params, shouldRevoke, audit)
	} else {
		updated, err = h.store.UpdateUserAdmin(r.Context(), params)
	}
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}
	if _, atomic := h.store.(atomicAdminStore); atomic {
		_ = response.JSON(w, http.StatusOK, toAdminUserResponse(updated))
		return
	}
	if err := h.revokeChangedSessions(r.Context(), id, target, req, params); err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}
	if err := h.auditUserUpdate(r.Context(), r, actor, id, target, updated); err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}
	_ = response.JSON(w, http.StatusOK, toAdminUserResponse(updated))
}
