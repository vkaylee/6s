package scoring

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"6s/internal/apperror"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// BusinessService defines operations exposed by scoring HTTP handler.
type BusinessService interface {
	GetLocationLeaderboard(ctx context.Context, locationCode string) ([]LocationHealthItem, error)
	GetReporterLeaderboard(ctx context.Context, locationCode string) ([]ReporterItem, error)
	GetRules(ctx context.Context) ([]db.ScoringRule, error)
	UpdateRules(ctx context.Context, req UpdateRulesRequest, adminUserID int64) error
	GetIssueScoreLogs(ctx context.Context, issueID int64) ([]ScoreLogItem, error)
	GetTargetScoreLogsInCycle(ctx context.Context, targetType, targetID string) ([]ScoreLogItem, error)
}

// Handler handles scoring and leaderboard HTTP endpoints.
type Handler struct {
	service BusinessService
}

// NewHandler creates a new scoring Handler.
func NewHandler(service BusinessService) *Handler {
	return &Handler{service: service}
}

// GetLocationLeaderboard handles GET /api/leaderboard/locations.
func (h *Handler) GetLocationLeaderboard(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.GetLocationLeaderboard(r.Context(), r.URL.Query().Get("location_code"))
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrLeaderboardFailed).WithCause(err))
		return
	}
	response.JSON(w, http.StatusOK, items)
}

// GetReporterLeaderboard handles GET /api/leaderboard/reporters.
func (h *Handler) GetReporterLeaderboard(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.GetReporterLeaderboard(r.Context(), r.URL.Query().Get("location_code"))
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrLeaderboardFailed).WithCause(err))
		return
	}
	response.JSON(w, http.StatusOK, items)
}

// GetIssueScoreLogs handles GET /api/issues/{id}/score-logs.
func (h *Handler) GetIssueScoreLogs(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(err))
		return
	}

	items, err := h.service.GetIssueScoreLogs(r.Context(), id)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrScoreLogsFailed).WithCause(err))
		return
	}
	response.JSON(w, http.StatusOK, items)
}

// GetTargetScoreLogs handles GET /api/leaderboard/score-logs?target_type=...&target_id=...
func (h *Handler) GetTargetScoreLogs(w http.ResponseWriter, r *http.Request) {
	targetType := r.URL.Query().Get("target_type")
	targetID := r.URL.Query().Get("target_id")
	if targetType != "LOCATION" && targetType != auth.RoleUser.String() {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}
	if targetID == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}

	items, err := h.service.GetTargetScoreLogsInCycle(r.Context(), targetType, targetID)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrScoreLogsFailed).WithCause(err))
		return
	}
	response.JSON(w, http.StatusOK, items)
}

// GetRules handles GET /api/config/scoring.
func (h *Handler) GetRules(w http.ResponseWriter, r *http.Request) {
	rules, err := h.service.GetRules(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrRulesLoadFailed).WithCause(err))
		return
	}
	response.JSON(w, http.StatusOK, rules)
}

// UpdateRulesPayload defines payload for PUT /api/config/scoring.
type UpdateRulesPayload struct {
	Rules     map[string]int32 `json:"rules"`
	ApplyFrom *time.Time       `json:"apply_from,omitempty"`
	Reason    string           `json:"reason,omitempty"`
}

// UpdateRules handles PUT /api/config/scoring (Admin only).
func (h *Handler) UpdateRules(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	var payload UpdateRulesPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	err := h.service.UpdateRules(r.Context(), UpdateRulesRequest(payload), currentUser.ID)

	if err != nil {
		if errors.Is(err, ErrMissingReason) {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingRulesReason))
			return
		}
		if errors.Is(err, ErrInvalidRules) {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidRules))
			return
		}
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"message": "Cập nhật quy tắc chấm điểm thành công",
	})
}
