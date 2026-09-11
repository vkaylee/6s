package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"6s/internal/apperror"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// TeamLocationStore is the persistence contract for team-location mapping.
type TeamLocationStore interface {
	GetTeamByID(ctx context.Context, id int64) (db.Team, error)
	GetLocationByCode(ctx context.Context, code string) (db.Location, error)
	ListTeamLocations(ctx context.Context, teamID int64) ([]db.ListTeamLocationsRow, error)
	AddTeamLocation(ctx context.Context, arg db.AddTeamLocationParams) error
	DeleteTeamLocation(ctx context.Context, arg db.DeleteTeamLocationParams) error
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// TeamLocationHandler manages team locations assignments (Admin only).
type TeamLocationHandler struct {
	store TeamLocationStore
}

// NewTeamLocationHandler creates a new handler for team location assignments.
func NewTeamLocationHandler(store TeamLocationStore) *TeamLocationHandler {
	return &TeamLocationHandler{store: store}
}

// TeamLocationResponse formats the response for a team-location relationship.
type TeamLocationResponse struct {
	TeamID       int64  `json:"team_id"`
	LocationCode string `json:"location_code"`
	CreatedAt    string `json:"created_at"`
	NameVi       string `json:"name_vi"`
	NameZh       string `json:"name_zh"`
	NameEn       string `json:"name_en"`
}

// ListTeamLocations handles GET /api/admin/teams/{id}/locations.
func (h *TeamLocationHandler) ListTeamLocations(w http.ResponseWriter, r *http.Request) {
	teamID, err := response.ParseIDParam(r, "id")
	if err != nil || teamID <= 0 {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	rows, err := h.store.ListTeamLocations(r.Context(), teamID)
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	items := make([]TeamLocationResponse, 0, len(rows))
	for _, r := range rows {
		items = append(items, TeamLocationResponse{
			TeamID:       r.TeamID,
			LocationCode: r.LocationCode,
			CreatedAt:    r.CreatedAt.UTC().Format(time.RFC3339Nano),
			NameVi:       r.NameVi,
			NameZh:       r.NameZh,
			NameEn:       r.NameEn,
		})
	}
	_ = response.JSON(w, http.StatusOK, items)
}

// AddTeamLocation handles PUT /api/admin/teams/{id}/locations/{code}.
func (h *TeamLocationHandler) AddTeamLocation(w http.ResponseWriter, r *http.Request) {
	teamID, err := response.ParseIDParam(r, "id")
	if err != nil || teamID <= 0 {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	code := chi.URLParam(r, "code")
	if code == "" {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "location code required"))
		return
	}
	team, err := h.store.GetTeamByID(r.Context(), teamID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			_ = response.AppError(w, r, apperror.NotFound("TEAM_NOT_FOUND", "team not found"))
			return
		}
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
		return
	}
	loc, err := h.store.GetLocationByCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			_ = response.AppError(w, r, apperror.NotFound("LOCATION_NOT_FOUND", "location not found"))
			return
		}
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrLocationQueryFailed).WithCause(err))
		return
	}
	if team.SiteID != loc.SiteID {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "team and location must belong to the same site"))
		return
	}

	actor, _ := GetUserFromContext(r.Context())
	var actorIDParam sql.NullInt64
	if actor.ID != 0 {
		actorIDParam = sql.NullInt64{Int64: actor.ID, Valid: true}
	}
	if err := h.store.AddTeamLocation(r.Context(), db.AddTeamLocationParams{
		TeamID:       teamID,
		LocationCode: code,
		CreatedBy:    actorIDParam,
	}); err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}

	oldJSON, _ := json.Marshal(map[string]any{"action": "add_team_location"})
	newJSON, _ := json.Marshal(map[string]any{"team_id": teamID, "location_code": code})
	_ = h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      actorIDParam,
		Action:      "TEAM_LOCATION_ADD",
		TargetTable: "team_locations",
		TargetID:    fmt.Sprintf("%d:%s", teamID, code),
		OldValue:    oldJSON,
		NewValue:    newJSON,
		IpAddress:   sql.NullString{String: clientIP(r), Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	})
	_ = response.JSON(w, http.StatusOK, map[string]any{"team_id": teamID, "location_code": code})
}

// DeleteTeamLocation handles DELETE /api/admin/teams/{id}/locations/{code}.
func (h *TeamLocationHandler) DeleteTeamLocation(w http.ResponseWriter, r *http.Request) {
	teamID, err := response.ParseIDParam(r, "id")
	if err != nil || teamID <= 0 {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	code := chi.URLParam(r, "code")
	if code == "" {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "location code required"))
		return
	}
	if err := h.store.DeleteTeamLocation(r.Context(), db.DeleteTeamLocationParams{
		TeamID:       teamID,
		LocationCode: code,
	}); err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserUpdateFailed).WithCause(err))
		return
	}
	actor, _ := GetUserFromContext(r.Context())
	var actorIDParam sql.NullInt64
	if actor.ID != 0 {
		actorIDParam = sql.NullInt64{Int64: actor.ID, Valid: true}
	}
	oldJSON, _ := json.Marshal(map[string]any{"action": "delete_team_location"})
	newJSON, _ := json.Marshal(map[string]any{"team_id": teamID, "location_code": code})
	_ = h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      actorIDParam,
		Action:      "TEAM_LOCATION_DELETE",
		TargetTable: "team_locations",
		TargetID:    fmt.Sprintf("%d:%s", teamID, code),
		OldValue:    oldJSON,
		NewValue:    newJSON,
		IpAddress:   sql.NullString{String: clientIP(r), Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	})
	w.WriteHeader(http.StatusNoContent)
}
