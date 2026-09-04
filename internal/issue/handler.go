package issue

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/response"
)

// Service defines operations required by HTTP handlers.
type Service interface {
	SyncIssue(ctx context.Context, req SyncIssueRequest, currentUser db.User) (*Response, bool, error)
	ResolveIssue(ctx context.Context, req ResolveIssueRequest, currentUser db.User) (*Response, error)
	CloseIssue(ctx context.Context, req CloseIssueRequest, currentUser db.User) (*Response, error)
	ReopenIssue(ctx context.Context, req ReopenIssueRequest, currentUser db.User) (*Response, error)
	InvalidateIssue(ctx context.Context, req InvalidateIssueRequest, currentUser db.User) (*Response, error)
	PatchIssue(ctx context.Context, req PatchIssueRequest, currentUser db.User) (*Response, error)
	GetIssueByID(ctx context.Context, id int64) (*Response, error)
	ListIssuesFiltered(ctx context.Context, status, category, locationCode string, page, limit int) ([]Response, int64, error)
}

// Handler handles Issue HTTP endpoints.
type Handler struct {
	service Service
}

// NewHandler creates a new Issue Handler.
func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

// List handles GET /api/issues.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	category := r.URL.Query().Get("category")
	locationCode := r.URL.Query().Get("location_code")

	page := 1
	if pStr := r.URL.Query().Get("page"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil && p > 0 {
			page = p
		}
	}

	limit := 20
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	items, total, err := h.service.ListIssuesFiltered(r.Context(), status, category, locationCode, page, limit)
	if err != nil {
		response.InternalServerError(w, "Không thể lấy danh sách issue")
		return
	}

	response.Paginated(w, http.StatusOK, items, page, limit, int(total))
}

// GetByID handles GET /api/issues/{id}.
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(w, "id không hợp lệ")
		return
	}

	resp, err := h.service.GetIssueByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.NotFound(w, "Không tìm thấy issue")
			return
		}
		response.InternalServerError(w, "Không thể tải chi tiết issue")
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// Sync handles POST /api/issues/sync (Multipart form).
func (h *Handler) Sync(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		response.BadRequest(w, "Dữ liệu multipart không hợp lệ: dung lượng vượt quá giới hạn")
		return
	}

	clientUUID := strings.TrimSpace(r.FormValue("client_uuid"))
	category := strings.TrimSpace(r.FormValue("category"))
	locationCode := strings.TrimSpace(r.FormValue("location_code"))
	description := strings.TrimSpace(r.FormValue("description"))
	tagsStr := strings.TrimSpace(r.FormValue("tags"))

	if clientUUID == "" || category == "" || locationCode == "" {
		response.BadRequest(w, "Thiếu trường bắt buộc: client_uuid, category, location_code")
		return
	}

	var tags []string
	if tagsStr != "" {
		if err := json.Unmarshal([]byte(tagsStr), &tags); err != nil {
			log.Printf("invalid tags format: %v", err)
		}
	}

	photoBefore, _, fileErr := r.FormFile("photo_before")
	if fileErr != nil {
		response.BadRequest(w, "Thiếu ảnh bắt buộc: photo_before")
		return
	}
	if cErr := photoBefore.Close(); cErr != nil {
		log.Printf("failed to close photoBefore: %v", cErr)
	}

	var photoBeforeHeader, photoDetailHeader *multipart.FileHeader
	if fhs := r.MultipartForm.File["photo_before"]; len(fhs) > 0 {
		photoBeforeHeader = fhs[0]
	}
	if fhs := r.MultipartForm.File["photo_detail"]; len(fhs) > 0 {
		photoDetailHeader = fhs[0]
	}

	syncReq := SyncIssueRequest{
		ClientUUID:   clientUUID,
		Category:     category,
		LocationCode: locationCode,
		Tags:         tags,
		Description:  description,
		PhotoBefore:  photoBeforeHeader,
		PhotoDetail:  photoDetailHeader,
	}

	resp, created, err := h.service.SyncIssue(r.Context(), syncReq, currentUser)
	if err != nil {
		if errors.Is(err, ErrInvalidCategory) {
			response.BadRequest(w, "Phân loại 6S không hợp lệ (1S - 6S)")
			return
		}
		response.BadRequest(w, "Không thể lưu issue: "+err.Error())
		return
	}

	statusCode := http.StatusOK
	if created {
		statusCode = http.StatusCreated
	}
	response.JSON(w, statusCode, resp)
}

// Resolve handles POST /api/issues/{id}/resolve (Multipart form).
func (h *Handler) Resolve(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, parseErr := strconv.ParseInt(idStr, 10, 64)
	if parseErr != nil {
		response.BadRequest(w, "id không hợp lệ")
		return
	}

	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		response.BadRequest(w, "Dữ liệu multipart không hợp lệ")
		return
	}

	resolvedUUID := strings.TrimSpace(r.FormValue("resolved_client_uuid"))
	expVerStr := strings.TrimSpace(r.FormValue("expected_version"))
	forceStr := strings.TrimSpace(r.FormValue("force"))
	force := (forceStr == "true" || forceStr == "1")

	if resolvedUUID == "" {
		response.BadRequest(w, "Thiếu resolved_client_uuid")
		return
	}

	expectedVersion := int32(1)
	if expVerStr != "" {
		if ev, evErr := strconv.ParseInt(expVerStr, 10, 32); evErr == nil {
			expectedVersion = int32(ev) //nolint:gosec
		}
	}

	photoAfter, _, fileErr := r.FormFile("photo_after")
	if fileErr != nil {
		response.BadRequest(w, "Thiếu ảnh bắt buộc: photo_after")
		return
	}
	if err := photoAfter.Close(); err != nil {
		log.Printf("failed to close photoAfter: %v", err)
	}

	var photoAfterHeader *multipart.FileHeader
	if fhs := r.MultipartForm.File["photo_after"]; len(fhs) > 0 {
		photoAfterHeader = fhs[0]
	}

	resp, err := h.service.ResolveIssue(r.Context(), ResolveIssueRequest{
		IssueID:            id,
		ResolvedClientUUID: resolvedUUID,
		ExpectedVersion:    expectedVersion,
		Force:              force,
		PhotoAfter:         photoAfterHeader,
	}, currentUser)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.NotFound(w, "Không tìm thấy issue")
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			response.Conflict(w, "ISSUE_CONFLICT", "Phiên bản issue đã bị thay đổi bởi người dùng khác", map[string]any{
				"current_status":  resp,
				"current_version": expectedVersion,
			})
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// CloseRequest defines payload for closing an issue.
type CloseRequest struct {
	ScoreRating     int16  `json:"score_rating"`
	ExpectedVersion *int32 `json:"expected_version"`
}

// Close handles POST /api/issues/{id}/close.
func (h *Handler) Close(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(w, "id không hợp lệ")
		return
	}

	var req CloseRequest
	if r.Body != nil {
		if decErr := json.NewDecoder(r.Body).Decode(&req); decErr != nil && !errors.Is(decErr, errors.New("EOF")) {
			log.Printf("decode close body err: %v", decErr)
		}
	}

	resp, err := h.service.CloseIssue(r.Context(), CloseIssueRequest{
		IssueID:         id,
		ScoreRating:     req.ScoreRating,
		ExpectedVersion: req.ExpectedVersion,
	}, currentUser)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.NotFound(w, "Không tìm thấy issue")
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.Forbidden(w, "Bạn không có quyền duyệt đạt issue này")
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			response.Conflict(w, "ISSUE_CONFLICT", err.Error(), nil)
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// ReopenRequest defines payload for reopening an issue.
type ReopenRequest struct {
	RejectReason    string `json:"reject_reason"`
	ExpectedVersion *int32 `json:"expected_version"`
}

// Reopen handles POST /api/issues/{id}/reopen.
func (h *Handler) Reopen(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(w, "id không hợp lệ")
		return
	}

	var req ReopenRequest
	if r.Body != nil {
		if decErr := json.NewDecoder(r.Body).Decode(&req); decErr != nil && !errors.Is(decErr, errors.New("EOF")) {
			log.Printf("decode reopen body err: %v", decErr)
		}
	}

	resp, err := h.service.ReopenIssue(r.Context(), ReopenIssueRequest{
		IssueID:         id,
		RejectReason:    req.RejectReason,
		ExpectedVersion: req.ExpectedVersion,
	}, currentUser)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.NotFound(w, "Không tìm thấy issue")
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.Forbidden(w, "Bạn không có quyền mở lại issue này")
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			response.Conflict(w, "ISSUE_CONFLICT", err.Error(), nil)
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// InvalidRequest defines payload for invalidating an issue.
type InvalidRequest struct {
	Reason          string `json:"reason"`
	ExpectedVersion *int32 `json:"expected_version"`
}

// Invalid handles POST /api/issues/{id}/invalid.
func (h *Handler) Invalid(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(w, "id không hợp lệ")
		return
	}

	var req InvalidRequest
	if r.Body != nil {
		if decErr := json.NewDecoder(r.Body).Decode(&req); decErr != nil && !errors.Is(decErr, errors.New("EOF")) {
			log.Printf("decode invalid body err: %v", decErr)
		}
	}

	resp, err := h.service.InvalidateIssue(r.Context(), InvalidateIssueRequest{
		IssueID:         id,
		Reason:          req.Reason,
		ExpectedVersion: req.ExpectedVersion,
	}, currentUser)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.NotFound(w, "Không tìm thấy issue")
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.Forbidden(w, "Chỉ quản trị viên hoặc cán bộ an toàn mới được bác bỏ issue")
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			response.Conflict(w, "ISSUE_CONFLICT", err.Error(), nil)
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// PatchRequest defines payload for in-place quick editing of an issue.
type PatchRequest struct {
	Category     *string  `json:"category"`
	LocationCode *string  `json:"location_code"`
	Tags         []string `json:"tags"`
}

// Patch handles PATCH /api/issues/{id}.
func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.BadRequest(w, "id không hợp lệ")
		return
	}

	var req PatchRequest
	if decErr := json.NewDecoder(r.Body).Decode(&req); decErr != nil {
		response.BadRequest(w, "Dữ liệu JSON không hợp lệ")
		return
	}

	resp, err := h.service.PatchIssue(r.Context(), PatchIssueRequest{
		IssueID:      id,
		Category:     req.Category,
		LocationCode: req.LocationCode,
		Tags:         req.Tags,
	}, currentUser)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.NotFound(w, "Không tìm thấy issue")
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.Forbidden(w, "Bạn không có quyền chỉnh sửa issue này")
			return
		}
		if errors.Is(err, ErrInvalidCategory) {
			response.BadRequest(w, "Phân loại 6S không hợp lệ")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}

	response.JSON(w, http.StatusOK, resp)
}
