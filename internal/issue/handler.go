package issue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"6s/internal/apperror"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/i18n"
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
	ListIssuesFiltered(ctx context.Context, statuses, categories, locationCodes []string, overdue bool, page, limit int) ([]Response, int64, error)
	SubscribeEvents() (<-chan Event, func())
}

// Handler handles Issue HTTP endpoints.
type Handler struct {
	service Service
}

// NewHandler creates a new Issue Handler.
func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func parseQueryValues(q map[string][]string, singularKey, pluralKey string) []string {
	var results []string
	for _, key := range []string{pluralKey, singularKey} {
		for _, val := range q[key] {
			for _, part := range strings.Split(val, ",") {
				if s := strings.TrimSpace(part); s != "" {
					results = append(results, s)
				}
			}
		}
	}
	return results
}

// List handles GET /api/issues.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	statuses := parseQueryValues(q, "status", "statuses")
	categories := parseQueryValues(q, "category", "categories")
	locationCodes := parseQueryValues(q, "location_code", "location_codes")

	overdue := q.Get("overdue") == "true"

	page := 1
	if pStr := q.Get("page"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil && p > 0 {
			page = p
		}
	}

	limit := 20
	if lStr := q.Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	items, total, err := h.service.ListIssuesFiltered(r.Context(), statuses, categories, locationCodes, overdue, page, limit)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrIssueListFailed).WithCause(err))
		return
	}

	response.Paginated(w, http.StatusOK, items, page, limit, int(total))
}

// GetByID handles GET /api/issues/{id}.
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(err))
		return
	}

	resp, err := h.service.GetIssueByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.AppError(w, r, apperror.NotFound(i18n.ErrIssueNotFound))
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrIssueGetFailed).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// Sync handles POST /api/issues/sync (Multipart form).
func (h *Handler) Sync(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMultipartTooLarge).WithCause(err))
		return
	}

	clientUUID := strings.TrimSpace(r.FormValue("client_uuid"))
	category := strings.TrimSpace(r.FormValue("category"))
	causeType := strings.TrimSpace(r.FormValue("cause_type"))
	locationCode := strings.TrimSpace(r.FormValue("location_code"))
	description := strings.TrimSpace(r.FormValue("description"))
	tagsStr := strings.TrimSpace(r.FormValue("tags"))

	if clientUUID == "" || category == "" || locationCode == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingIssueFields))
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
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingPhotoBefore).WithCause(fileErr))
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
		CauseType:    causeType,
		LocationCode: locationCode,
		Tags:         tags,
		Description:  description,
		PhotoBefore:  photoBeforeHeader,
		PhotoDetail:  photoDetailHeader,
	}

	resp, created, err := h.service.SyncIssue(r.Context(), syncReq, currentUser)
	if err != nil {
		if errors.Is(err, ErrInvalidCategory) {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidCategory))
			return
		}
		response.AppError(w, r, apperror.BadRequest(i18n.ErrIssueSaveFailed, err.Error()).WithCause(err))
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
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	idStr := chi.URLParam(r, "id")
	id, parseErr := strconv.ParseInt(idStr, 10, 64)
	if parseErr != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(parseErr))
		return
	}

	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidMultipart).WithCause(err))
		return
	}

	resolvedUUID := strings.TrimSpace(r.FormValue("resolved_client_uuid"))
	expVerStr := strings.TrimSpace(r.FormValue("expected_version"))
	forceStr := strings.TrimSpace(r.FormValue("force"))
	force := (forceStr == "true" || forceStr == "1")

	if resolvedUUID == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingResolvedUUID))
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
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingPhotoAfter).WithCause(fileErr))
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
			response.AppError(w, r, apperror.NotFound(i18n.ErrIssueNotFound))
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			appErr := apperror.Conflict("ISSUE_CONFLICT", i18n.ErrIssueVersionChanged).WithDetails(map[string]any{
				"current_status":  resp,
				"current_version": expectedVersion,
			})
			response.AppError(w, r, appErr)
			return
		}
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
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
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(err))
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
			response.AppError(w, r, apperror.NotFound(i18n.ErrIssueNotFound))
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.AppError(w, r, apperror.Forbidden(i18n.ErrIssueCloseForbidden))
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			response.AppError(w, r, apperror.Conflict("ISSUE_CONFLICT", i18n.ErrIssueConflict).WithCause(err))
			return
		}
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
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
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(err))
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
			response.AppError(w, r, apperror.NotFound(i18n.ErrIssueNotFound))
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.AppError(w, r, apperror.Forbidden(i18n.ErrIssueReopenForbidden))
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			response.AppError(w, r, apperror.Conflict("ISSUE_CONFLICT", i18n.ErrIssueConflict).WithCause(err))
			return
		}
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
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
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(err))
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
			response.AppError(w, r, apperror.NotFound(i18n.ErrIssueNotFound))
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.AppError(w, r, apperror.Forbidden(i18n.ErrIssueInvalidForbidden))
			return
		}
		if errors.Is(err, ErrIssueConflict) {
			response.AppError(w, r, apperror.Conflict("ISSUE_CONFLICT", i18n.ErrIssueConflict).WithCause(err))
			return
		}
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// PatchRequest defines payload for in-place quick editing of an issue.
type PatchRequest struct {
	Category     *string  `json:"category"`
	CauseType    *string  `json:"cause_type"`
	LocationCode *string  `json:"location_code"`
	Description  *string  `json:"description"`
	Tags         []string `json:"tags"`
}

func (h *Handler) parseMultipartPatch(r *http.Request) (PatchIssueRequest, error) {
	var patchReq PatchIssueRequest
	if parseErr := r.ParseMultipartForm(10 * 1024 * 1024); parseErr != nil {
		return patchReq, parseErr
	}
	if cat := strings.TrimSpace(r.FormValue("category")); cat != "" {
		patchReq.Category = &cat
	}
	if cause := strings.TrimSpace(r.FormValue("cause_type")); cause != "" {
		patchReq.CauseType = &cause
	}
	if loc := strings.TrimSpace(r.FormValue("location_code")); loc != "" {
		patchReq.LocationCode = &loc
	}
	if desc := strings.TrimSpace(r.FormValue("description")); desc != "" || r.Form.Has("description") {
		patchReq.Description = &desc
	}
	if tagsStr := strings.TrimSpace(r.FormValue("tags")); tagsStr != "" {
		var tags []string
		if unmarshalErr := json.Unmarshal([]byte(tagsStr), &tags); unmarshalErr == nil {
			patchReq.Tags = tags
		}
	}
	if fhs := r.MultipartForm.File["photo_before"]; len(fhs) > 0 {
		patchReq.PhotoBefore = fhs[0]
	}
	if fhs := r.MultipartForm.File["photo_detail"]; len(fhs) > 0 {
		patchReq.PhotoDetail = fhs[0]
	}
	return patchReq, nil
}

func (h *Handler) parseJSONPatch(r *http.Request) (PatchIssueRequest, error) {
	var req PatchRequest
	if decErr := json.NewDecoder(r.Body).Decode(&req); decErr != nil {
		return PatchIssueRequest{}, decErr
	}
	return PatchIssueRequest{
		Category:     req.Category,
		CauseType:    req.CauseType,
		LocationCode: req.LocationCode,
		Description:  req.Description,
		Tags:         req.Tags,
	}, nil
}

// Patch handles PATCH /api/issues/{id} (JSON or multipart/form-data).
func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	idStr := chi.URLParam(r, "id")
	id, parseIDErr := strconv.ParseInt(idStr, 10, 64)
	if parseIDErr != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(parseIDErr))
		return
	}

	var patchReq PatchIssueRequest
	var parseErr error
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		patchReq, parseErr = h.parseMultipartPatch(r)
		if parseErr != nil {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrMultipartTooLarge).WithCause(parseErr))
			return
		}
	} else {
		patchReq, parseErr = h.parseJSONPatch(r)
		if parseErr != nil {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(parseErr))
			return
		}
	}
	patchReq.IssueID = id
	resp, err := h.service.PatchIssue(r.Context(), patchReq, currentUser)
	if err != nil {
		if errors.Is(err, ErrIssueNotFound) {
			response.AppError(w, r, apperror.NotFound(i18n.ErrIssueNotFound))
			return
		}
		if errors.Is(err, ErrPermissionDenied) {
			response.AppError(w, r, apperror.Forbidden(i18n.ErrIssuePatchForbidden))
			return
		}
		if errors.Is(err, ErrInvalidCategory) {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidCategory))
			return
		}
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, resp)
}

// Events streams real-time issue updates via Server-Sent Events (SSE).
func (h *Handler) Events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(errors.New("streaming unsupported")))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	eventsCh, unsubscribe := h.service.SubscribeEvents()
	defer unsubscribe()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case evt, open := <-eventsCh:
			if !open {
				return
			}
			data, err := json.Marshal(evt)
			if err != nil {
				continue
			}
			if _, writeErr := fmt.Fprintf(w, "event: issue\ndata: %s\n\n", data); writeErr != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			// Periodic comment keepalive to prevent proxy idle connection drop
			if _, pingErr := fmt.Fprintf(w, ": keepalive\n\n"); pingErr != nil {
				return
			}
			flusher.Flush()
		}
	}
}
