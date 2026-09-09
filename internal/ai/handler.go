package ai

import (
	"encoding/json"
	"net/http"
	"strings"

	"6s/internal/apperror"
	"6s/internal/auth"
	"6s/internal/i18n"
	"6s/internal/response"
)

// Handler exposes HTTP endpoints for AI configuration and operations.
type Handler struct {
	svc *Service
}

// NewHandler creates a new Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// GetConfig handles GET /api/config/ai (Admin only).
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.GetConfig(r.Context())
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			writeAIAppError(w, r, appErr)
			return
		}
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	writeAIJSON(w, http.StatusOK, cfg)
}

// UpdateConfig handles PUT /api/config/ai (Admin only).
func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeAIAppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	var req UpdateConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	cfg, err := h.svc.UpdateConfig(r.Context(), req, currentUser.ID)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			writeAIAppError(w, r, appErr)
			return
		}
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	writeAIJSON(w, http.StatusOK, cfg)
}

// TestConnection handles POST /api/config/ai/test (Admin only).
func (h *Handler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var req TestRequest
	if r.Body != nil && r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeAIAppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
			return
		}
	}

	res, err := h.svc.TestConnection(r.Context(), req)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			writeAIAppError(w, r, appErr)
			return
		}
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	writeAIJSON(w, http.StatusOK, res)
}

// TestDNS handles POST /api/config/ai/test-dns (Admin only).
func (h *Handler) TestDNS(w http.ResponseWriter, r *http.Request) {
	var req DNSTestRequest
	if r.Body != nil && r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeAIAppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
			return
		}
	}

	res, err := h.svc.TestDNS(r.Context(), req)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			writeAIAppError(w, r, appErr)
			return
		}
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	writeAIJSON(w, http.StatusOK, res)
}

// TranslateRequest defines input for POST /api/ai/translate.
type TranslateRequest struct {
	Text       string `json:"text"`
	TargetLang string `json:"target_lang"`
}

// TranslateResponse defines output for POST /api/ai/translate.
type TranslateResponse struct {
	TranslatedText string `json:"translated_text"`
}

// Translate handles POST /api/ai/translate (Authenticated users).
func (h *Handler) Translate(w http.ResponseWriter, r *http.Request) {
	var req TranslateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	trimmedText := strings.TrimSpace(req.Text)
	if trimmedText == "" {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "text is required"))
		return
	}

	if len(trimmedText) > 10000 {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "text exceeds 10,000 characters"))
		return
	}

	targetLang := strings.TrimSpace(req.TargetLang)
	if targetLang == "" {
		// Fallback to request locale or default
		targetLang = i18n.FromContext(r.Context())
	}

	translated, err := h.svc.Translate(r.Context(), trimmedText, targetLang)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			writeAIAppError(w, r, appErr)
			return
		}
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	writeAIJSON(w, http.StatusOK, TranslateResponse{
		TranslatedText: translated,
	})
}

// CachedTranslationRequest defines input for POST /api/ai/cached.
type CachedTranslationRequest struct {
	Text       string `json:"text"`
	TargetLang string `json:"target_lang"`
}

// CachedTranslationResponse defines output for POST /api/ai/cached.
type CachedTranslationResponse struct {
	Cached         bool   `json:"cached"`
	TranslatedText string `json:"translated_text,omitempty"`
}

// GetCached handles POST /api/ai/cached (Authenticated users).
func (h *Handler) GetCached(w http.ResponseWriter, r *http.Request) {
	var req CachedTranslationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	trimmedText := strings.TrimSpace(req.Text)
	if trimmedText == "" {
		writeAIJSON(w, http.StatusOK, CachedTranslationResponse{Cached: false})
		return
	}

	targetLang := strings.TrimSpace(req.TargetLang)
	if targetLang == "" {
		targetLang = i18n.FromContext(r.Context())
	}

	translated, found, err := h.svc.GetCachedTranslation(r.Context(), trimmedText, targetLang)
	if err != nil {
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	writeAIJSON(w, http.StatusOK, CachedTranslationResponse{
		Cached:         found,
		TranslatedText: translated,
	})
}

// Status handles GET /api/ai/status (Authenticated users).
// Exposes only the enabled flag so the UI can hide AI affordances.
func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	writeAIJSON(w, http.StatusOK, map[string]bool{"enabled": h.svc.IsEnabled(r.Context())})
}

// Review handles POST /api/ai/review (Authenticated users).
func (h *Handler) Review(w http.ResponseWriter, r *http.Request) {
	var req ReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	if req.IssueID <= 0 {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "issue_id is required"))
		return
	}
	if strings.TrimSpace(req.Lang) == "" {
		req.Lang = i18n.FromContext(r.Context())
	}

	res, err := h.svc.Review(r.Context(), req)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			writeAIAppError(w, r, appErr)
			return
		}
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	writeAIJSON(w, http.StatusOK, res)
}

// FollowUp handles POST /api/ai/review-follow-up (Authenticated users).
func (h *Handler) FollowUp(w http.ResponseWriter, r *http.Request) {
	var req FollowUpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	if req.IssueID <= 0 {
		writeAIAppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "issue_id is required"))
		return
	}
	if strings.TrimSpace(req.Lang) == "" {
		req.Lang = i18n.FromContext(r.Context())
	}
	res, err := h.svc.FollowUp(r.Context(), req)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			writeAIAppError(w, r, appErr)
			return
		}
		writeAIAppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	writeAIJSON(w, http.StatusOK, res)
}

func writeAIJSON(w http.ResponseWriter, status int, data any) {
	if err := response.JSON(w, status, data); err != nil {
		return
	}
}

func writeAIAppError(w http.ResponseWriter, r *http.Request, appErr *apperror.AppError) {
	if err := response.AppError(w, r, appErr); err != nil {
		return
	}
}
