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

// AdminStore defines database operations required by the user administration handler.
type AdminStore interface {
	ListUsers(ctx context.Context, arg db.ListUsersParams) ([]db.User, error)
	GetUserByID(ctx context.Context, id int64) (db.User, error)
	UpdateUserAdmin(ctx context.Context, arg db.UpdateUserAdminParams) (db.User, error)
	GetLocationByCode(ctx context.Context, code string) (db.Location, error)
	CountAdmins(ctx context.Context) (int64, error)
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
	RevokeUserRefreshTokens(ctx context.Context, userID int64) error
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
		response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}

	items := make([]AdminUserResponse, 0, len(users))
	for _, u := range users {
		items = append(items, toAdminUserResponse(u))
	}
	response.JSON(w, http.StatusOK, items)
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

// UpdateUser handles PATCH /api/admin/users/{id} (Admin only).
func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}

	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	if req.Role == nil && req.AssignedLocationCode == nil && req.IsActive == nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "no fields to update"))
		return
	}

	actor, _ := GetUserFromContext(r.Context())

	target, err := h.store.GetUserByID(r.Context(), id)
	if err != nil {
		if err == sql.ErrNoRows {
			response.AppError(w, r, apperror.NotFound(i18n.ErrUserNotFound))
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}

	params := db.UpdateUserAdminParams{ID: id, Role: target.Role, IsActive: target.IsActive}
	if req.Role != nil {
		role := Role(*req.Role)
		if !role.IsValid() {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "invalid role"))
			return
		}
		params.Role = role.String()
	}
	if req.AssignedLocationCode != nil {
		if *req.AssignedLocationCode == "" {
			params.AssignedLocationCode = sql.NullString{Valid: false}
		} else {
			if _, err := h.store.GetLocationByCode(r.Context(), *req.AssignedLocationCode); err != nil {
				if err == sql.ErrNoRows {
					response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "unknown location code"))
					return
				}
				response.AppError(w, r, apperror.Internal(i18n.ErrLocationQueryFailed).WithCause(err))
				return
			}
			params.AssignedLocationCode = sql.NullString{String: *req.AssignedLocationCode, Valid: true}
		}
	}
	// Last-active-admin protection: deactivating or demoting the final active admin is forbidden.
	if target.Role == RoleAdmin.String() && target.IsActive &&
		((req.IsActive != nil && !*req.IsActive) || (req.Role != nil && params.Role != RoleAdmin.String())) {
		count, err := h.store.CountAdmins(r.Context())
		if err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
			return
		}
		if count <= 1 {
			response.AppError(w, r, apperror.Conflict("LAST_ADMIN", i18n.ErrLastAdmin))
			return
		}
	}
	if req.IsActive != nil {
		params.IsActive = *req.IsActive
	}

	// Demotion to non-admin also checked when role changes on an active admin.
	if req.Role != nil && req.IsActive == nil && target.Role == RoleAdmin.String() &&
		target.IsActive && params.Role != RoleAdmin.String() {
		count, err := h.store.CountAdmins(r.Context())
		if err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
			return
		}
		if count <= 1 {
			response.AppError(w, r, apperror.Conflict("LAST_ADMIN", i18n.ErrLastAdmin))
			return
		}
	}

	updated, err := h.store.UpdateUserAdmin(r.Context(), params)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}

	// Role changes invalidate existing sessions so the user gets fresh authorization state.
	if req.Role != nil && params.Role != target.Role {
		if err := h.store.RevokeUserRefreshTokens(r.Context(), id); err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
			return
		}
	}

	// Deactivation revokes all refresh tokens (session invalidation on sensitive action).
	if req.IsActive != nil && !*req.IsActive && target.IsActive {
		if err := h.store.RevokeUserRefreshTokens(r.Context(), id); err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
			return
		}
	}

	oldJSON, _ := json.Marshal(toAdminUserResponse(target))
	newJSON, _ := json.Marshal(toAdminUserResponse(updated))
	_ = h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      sql.NullInt64{Int64: actor.ID, Valid: actor.ID != 0},
		Action:      "ADMIN_UPDATE_USER",
		TargetTable: "users",
		TargetID:    fmt.Sprintf("%d", id),
		OldValue:    oldJSON,
		NewValue:    newJSON,
		IpAddress:   sql.NullString{String: h.clientIP(r), Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	})

	response.JSON(w, http.StatusOK, toAdminUserResponse(updated))
}
