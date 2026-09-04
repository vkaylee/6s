package scoring

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/response"
)

// BusinessService defines operations exposed by scoring HTTP handler.
type BusinessService interface {
	GetLocationLeaderboard(ctx context.Context) ([]LocationHealthItem, error)
	GetReporterLeaderboard(ctx context.Context) ([]ReporterItem, error)
	GetRules(ctx context.Context) ([]db.ScoringRule, error)
	UpdateRules(ctx context.Context, req UpdateRulesRequest, adminUserID int64) error
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
	items, err := h.service.GetLocationLeaderboard(r.Context())
	if err != nil {
		response.InternalServerError(w, "Không thể tải bảng xếp hạng khu vực")
		return
	}
	response.JSON(w, http.StatusOK, items)
}

// GetReporterLeaderboard handles GET /api/leaderboard/reporters.
func (h *Handler) GetReporterLeaderboard(w http.ResponseWriter, r *http.Request) {
	items, err := h.service.GetReporterLeaderboard(r.Context())
	if err != nil {
		response.InternalServerError(w, "Không thể tải bảng thợ săn 6S")
		return
	}
	response.JSON(w, http.StatusOK, items)
}

// GetRules handles GET /api/config/scoring.
func (h *Handler) GetRules(w http.ResponseWriter, r *http.Request) {
	rules, err := h.service.GetRules(r.Context())
	if err != nil {
		response.InternalServerError(w, "Không thể tải quy tắc chấm điểm")
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
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	var payload UpdateRulesPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.BadRequest(w, "Dữ liệu JSON không hợp lệ")
		return
	}

	err := h.service.UpdateRules(r.Context(), UpdateRulesRequest(payload), currentUser.ID)

	if err != nil {
		if errors.Is(err, ErrMissingReason) {
			response.BadRequest(w, "Bắt buộc cung cấp lý do (reason) khi áp dụng hồi tố điểm (apply_from)")
			return
		}
		if errors.Is(err, ErrInvalidRules) {
			response.BadRequest(w, "Quy tắc điểm không hợp lệ")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"message": "Cập nhật quy tắc chấm điểm thành công",
	})
}
