package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"6s/internal/apperror"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// LocationMembershipStore is the persistence contract for location membership admin.
type LocationMembershipStore interface {
	GetLocationByCode(ctx context.Context, code string) (db.Location, error)
	GetUserByID(ctx context.Context, id int64) (db.User, error)
	ListLocationMemberships(ctx context.Context, code string) ([]db.ListLocationMembershipsRow, error)
	UpsertLocationMembership(ctx context.Context, arg db.UpsertLocationMembershipParams) (db.LocationMembership, error)
	DeleteLocationMembership(ctx context.Context, arg db.DeleteLocationMembershipParams) error
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// LocationMembershipHandler manages location membership assignments (Admin only).
type LocationMembershipHandler struct {
	store LocationMembershipStore
}

// NewLocationMembershipHandler creates a new admin handler for location members.
func NewLocationMembershipHandler(store LocationMembershipStore) *LocationMembershipHandler {
	return &LocationMembershipHandler{store: store}
}

// LocationMembershipResponse is the safe projection for membership listings.
type LocationMembershipResponse struct {
	LocationCode       string  `json:"location_code"`
	UserID             int64   `json:"user_id"`
	Username           string  `json:"username"`
	FullName           string  `json:"full_name"`
	ResponsibilityType string  `json:"responsibility_type"`
	ValidFrom          string  `json:"valid_from"`
	ValidTo            *string `json:"valid_to,omitempty"`
	IsActive           bool    `json:"is_active"`
}

func toLocationMembershipResponse(r db.ListLocationMembershipsRow) LocationMembershipResponse {
	resp := LocationMembershipResponse{
		LocationCode:       r.LocationCode,
		UserID:             r.UserID,
		Username:           r.Username,
		FullName:           r.FullName,
		ResponsibilityType: r.ResponsibilityType,
		ValidFrom:          r.ValidFrom.UTC().Format(time.RFC3339Nano),
		IsActive:           r.IsActive,
	}
	if r.ValidTo.Valid {
		s := r.ValidTo.Time.UTC().Format(time.RFC3339Nano)
		resp.ValidTo = &s
	}
	return resp
}

// ListLocationMembers handles GET /api/admin/locations/{code}/members.
func (h *LocationMembershipHandler) ListLocationMembers(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "location code required"))
		return
	}
	rows, err := h.store.ListLocationMemberships(r.Context(), code)
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	items := make([]LocationMembershipResponse, 0, len(rows))
	for _, row := range rows {
		items = append(items, toLocationMembershipResponse(row))
	}
	_ = response.JSON(w, http.StatusOK, items)
}

// UpsertLocationMemberRequest is the body for PUT /api/admin/locations/{code}/members/{userID}.
type UpsertLocationMemberRequest struct {
	ResponsibilityType string  `json:"responsibility_type"`
	ValidFrom          *string `json:"valid_from,omitempty"`
	ValidTo            *string `json:"valid_to,omitempty"`
	IsActive           *bool   `json:"is_active,omitempty"`
}

var validResponsibility = map[string]struct{}{"OWNER": {}, "BACKUP": {}, "REVIEWER": {}}

func parseTimePtr(t *string) (sql.NullTime, error) {
	if t == nil || *t == "" {
		return sql.NullTime{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, *t)
	if err != nil {
		return sql.NullTime{}, err
	}
	return sql.NullTime{Time: parsed, Valid: true}, nil
}

// UpsertLocationMember handles PUT /api/admin/locations/{code}/members/{userID}.
func (h *LocationMembershipHandler) UpsertLocationMember(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil || userID <= 0 {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	var req UpsertLocationMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	if _, ok := validResponsibility[req.ResponsibilityType]; !ok {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "responsibility_type must be OWNER, BACKUP, or REVIEWER"))
		return
	}
	from, err := parseTimePtr(req.ValidFrom)
	if err != nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "valid_from must be RFC3339"))
		return
	}
	to, err := parseTimePtr(req.ValidTo)
	if err != nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "valid_to must be RFC3339"))
		return
	}
	if to.Valid && from.Valid && !to.Time.After(from.Time) {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "valid_to must be after valid_from"))
		return
	}
	if _, err := h.store.GetLocationByCode(r.Context(), code); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			_ = response.AppError(w, r, apperror.NotFound("LOCATION_NOT_FOUND", "location not found"))
			return
		}
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrLocationQueryFailed).WithCause(err))
		return
	}
	if _, err := h.store.GetUserByID(r.Context(), userID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			_ = response.AppError(w, r, apperror.NotFound(i18n.ErrUserNotFound))
			return
		}
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	actor, _ := GetUserFromContext(r.Context())
	var activeParam sql.NullBool
	if req.IsActive != nil {
		activeParam = sql.NullBool{Bool: *req.IsActive, Valid: true}
	}
	fromParam := from
	toParam := to
	var actorIDParam sql.NullInt64
	if actor.ID != 0 {
		actorIDParam = sql.NullInt64{Int64: actor.ID, Valid: true}
	}
	member, err := h.store.UpsertLocationMembership(r.Context(), db.UpsertLocationMembershipParams{
		LocationCode:       code,
		UserID:             userID,
		ResponsibilityType: req.ResponsibilityType,
		ValidFrom:          fromParam,
		ValidTo:            toParam,
		IsActive:           activeParam,
		CreatedBy:          actorIDParam,
	})
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}
	oldJSON, _ := json.Marshal(map[string]any{"action": "upsert_location_member", "user_id": userID})
	newJSON, _ := json.Marshal(map[string]any{
		"location_code":       code,
		"user_id":             userID,
		"responsibility_type": req.ResponsibilityType,
		"is_active":           req.IsActive == nil || *req.IsActive,
	})
	_ = h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      actorIDParam,
		Action:      "LOCATION_MEMBER_UPSERT",
		TargetTable: "location_memberships",
		TargetID:    fmt.Sprintf("%s:%d", code, userID),
		OldValue:    oldJSON,
		NewValue:    newJSON,
		IpAddress:   sql.NullString{String: clientIP(r), Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	})
	_ = response.JSON(w, http.StatusOK, member)
}

// DeleteLocationMember handles DELETE /api/admin/locations/{code}/members/{userID}.
func (h *LocationMembershipHandler) DeleteLocationMember(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil || userID <= 0 {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	if err := h.store.DeleteLocationMembership(r.Context(), db.DeleteLocationMembershipParams{
		LocationCode: code,
		UserID:       userID,
	}); err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}
	actor, _ := GetUserFromContext(r.Context())
	var actorIDParam sql.NullInt64
	if actor.ID != 0 {
		actorIDParam = sql.NullInt64{Int64: actor.ID, Valid: true}
	}
	oldJSON, _ := json.Marshal(map[string]any{"action": "delete_location_member"})
	newJSON, _ := json.Marshal(map[string]any{"location_code": code, "user_id": userID})
	_ = h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      actorIDParam,
		Action:      "LOCATION_MEMBER_DELETE",
		TargetTable: "location_memberships",
		TargetID:    fmt.Sprintf("%s:%d", code, userID),
		OldValue:    oldJSON,
		NewValue:    newJSON,
		IpAddress:   sql.NullString{String: clientIP(r), Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	})
	w.WriteHeader(http.StatusNoContent)
}
