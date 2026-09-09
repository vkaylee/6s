// Package settings exposes administrative system settings handlers.
package settings

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"6s/internal/apperror"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/response"
	"6s/internal/timezone"
)

// Store provides persistence for system settings and audit records.
type Store interface {
	GetSystemSettings(ctx context.Context) (db.SystemSetting, error)
	UpdateSystemTimezone(ctx context.Context, arg db.UpdateSystemTimezoneParams) (db.SystemSetting, error)
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// Handler serves system settings administration.
type Handler struct{ store Store }

// NewHandler creates a system settings handler.
func NewHandler(store Store) *Handler { return &Handler{store: store} }

// GetTimezone returns the configured factory timezone.
func (h *Handler) GetTimezone(w http.ResponseWriter, r *http.Request) {
	settings, err := h.store.GetSystemSettings(r.Context())
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal("SYSTEM_SETTINGS_QUERY").WithCause(err))
		return
	}
	_ = response.JSON(w, http.StatusOK, map[string]string{"timezone": settings.Timezone})
}

// UpdateTimezone validates and persists the factory timezone.
func (h *Handler) UpdateTimezone(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Timezone string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || timezone.Validate(req.Timezone) != nil {
		_ = response.AppError(w, r, apperror.BadRequest("INVALID_TIMEZONE"))
		return
	}
	actor, _ := auth.GetUserFromContext(r.Context())
	updated, err := h.store.UpdateSystemTimezone(r.Context(), db.UpdateSystemTimezoneParams{Timezone: req.Timezone, UpdatedBy: sql.NullInt64{Int64: actor.ID, Valid: actor.ID != 0}})
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal("SYSTEM_SETTINGS_UPDATE").WithCause(err))
		return
	}
	_ = response.JSON(w, http.StatusOK, map[string]string{"timezone": updated.Timezone})
}
