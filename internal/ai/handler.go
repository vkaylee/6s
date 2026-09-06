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
			response.AppError(w, r, appErr)
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	response.JSON(w, http.StatusOK, cfg)
}

// UpdateConfig handles PUT /api/config/ai (Admin only).
func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	var req UpdateConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	cfg, err := h.svc.UpdateConfig(r.Context(), req, currentUser.ID)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			response.AppError(w, r, appErr)
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, cfg)
}

// TestConnection handles POST /api/config/ai/test (Admin only).
func (h *Handler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var req TestRequest
	if r.Body != nil && r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
			return
		}
	}

	res, err := h.svc.TestConnection(r.Context(), req)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			response.AppError(w, r, appErr)
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, res)
}

// TestDNS handles POST /api/config/ai/test-dns (Admin only).
func (h *Handler) TestDNS(w http.ResponseWriter, r *http.Request) {
	var req DNSTestRequest
	if r.Body != nil && r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
			return
		}
	}

	res, err := h.svc.TestDNS(r.Context(), req)
	if err != nil {
		if appErr, ok := err.(*apperror.AppError); ok {
			response.AppError(w, r, appErr)
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, res)
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
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	trimmedText := strings.TrimSpace(req.Text)
	if trimmedText == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "text is required"))
		return
	}

	if len(trimmedText) > 10000 {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "text exceeds 10,000 characters"))
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
			response.AppError(w, r, appErr)
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, TranslateResponse{
		TranslatedText: translated,
	})
}
