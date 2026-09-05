package masterdata

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"6s/internal/apperror"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// Store defines repository queries for locations and tags.
type Store interface {
	ListLocations(ctx context.Context) ([]db.Location, error)
	ListAllLocations(ctx context.Context) ([]db.Location, error)
	CreateLocation(ctx context.Context, arg db.CreateLocationParams) (db.Location, error)
	UpdateLocationActiveStatus(ctx context.Context, arg db.UpdateLocationActiveStatusParams) (db.Location, error)
	ListTags(ctx context.Context) ([]db.Tag, error)
	ListAllTags(ctx context.Context) ([]db.Tag, error)
	UpsertTag(ctx context.Context, arg db.UpsertTagParams) (db.Tag, error)
	UpdateTagActiveStatus(ctx context.Context, arg db.UpdateTagActiveStatusParams) (db.Tag, error)
	SetAllTagsActiveStatus(ctx context.Context, isActive bool) error
}

// Handler serves Master Data API endpoints.
type Handler struct {
	store Store
}

// NewHandler creates a new master data Handler.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// LocationResponse formats location for API.
type LocationResponse struct {
	Code     string `json:"code"`
	NameVi   string `json:"name_vi"`
	NameZh   string `json:"name_zh"`
	NameEn   string `json:"name_en"`
	QRCode   string `json:"qr_code"`
	IsActive bool   `json:"is_active"`
}

// TagResponse formats tag details for API responses.
type TagResponse struct {
	Code     string `json:"code"`
	NameVi   string `json:"name_vi"`
	NameZh   string `json:"name_zh"`
	NameEn   string `json:"name_en"`
	Category string `json:"category"`
	UseCount int32  `json:"use_count"`
	IsPreset bool   `json:"is_preset"`
	IsActive bool   `json:"is_active"`
}

// ListLocations handles GET /api/locations.
func (h *Handler) ListLocations(w http.ResponseWriter, r *http.Request) {
	locs, err := h.store.ListLocations(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrLocationQueryFailed).WithCause(err))
		return
	}

	items := make([]LocationResponse, 0, len(locs))
	for _, l := range locs {
		items = append(items, LocationResponse{
			Code:     l.Code,
			NameVi:   l.NameVi,
			NameZh:   l.NameZh,
			NameEn:   l.NameEn,
			QRCode:   l.QrCode,
			IsActive: l.IsActive,
		})
	}

	response.JSON(w, http.StatusOK, items)
}

// ListAllLocations handles GET /api/locations/all (Admin only).
func (h *Handler) ListAllLocations(w http.ResponseWriter, r *http.Request) {
	locs, err := h.store.ListAllLocations(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrLocationQueryFailed).WithCause(err))
		return
	}

	items := make([]LocationResponse, 0, len(locs))
	for _, l := range locs {
		items = append(items, LocationResponse{
			Code:     l.Code,
			NameVi:   l.NameVi,
			NameZh:   l.NameZh,
			NameEn:   l.NameEn,
			QRCode:   l.QrCode,
			IsActive: l.IsActive,
		})
	}

	response.JSON(w, http.StatusOK, items)
}

// UpdateLocationStatusRequest defines payload to toggle location active status.
type UpdateLocationStatusRequest struct {
	IsActive bool `json:"is_active"`
}

// UpdateLocationStatus handles PATCH /api/locations/{code}/status (Admin only).
func (h *Handler) UpdateLocationStatus(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		code = r.PathValue("code")
	}
	if code == "" {
		code = r.URL.Query().Get("code")
	}

	var req UpdateLocationStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	loc, err := h.store.UpdateLocationActiveStatus(r.Context(), db.UpdateLocationActiveStatusParams{
		Code:     code,
		IsActive: req.IsActive,
	})
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrLocationUpdateFailed).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, LocationResponse{
		Code:     loc.Code,
		NameVi:   loc.NameVi,
		NameZh:   loc.NameZh,
		NameEn:   loc.NameEn,
		QRCode:   loc.QrCode,
		IsActive: loc.IsActive,
	})
}

// CreateLocationRequest defines payload to create a new location.
type CreateLocationRequest struct {
	Code   string `json:"code"`
	NameVi string `json:"name_vi"`
	NameZh string `json:"name_zh"`
	NameEn string `json:"name_en"`
	QRCode string `json:"qr_code"`
}

// CreateLocation handles POST /api/locations (Admin only).
func (h *Handler) CreateLocation(w http.ResponseWriter, r *http.Request) {
	var req CreateLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	if req.Code == "" || req.NameVi == "" || req.QRCode == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrLocationMissingFields))
		return
	}
	loc, err := h.store.CreateLocation(r.Context(), db.CreateLocationParams{
		Code:   req.Code,
		NameVi: req.NameVi,
		NameZh: req.NameZh,
		NameEn: req.NameEn,
		QrCode: req.QRCode,
	})
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrLocationCreateFailed).WithCause(err))
		return
	}

	response.JSON(w, http.StatusCreated, LocationResponse{
		Code:     loc.Code,
		NameVi:   loc.NameVi,
		NameZh:   loc.NameZh,
		NameEn:   loc.NameEn,
		QRCode:   loc.QrCode,
		IsActive: loc.IsActive,
	})
}

// ListTags handles GET /api/tags.
func (h *Handler) ListTags(w http.ResponseWriter, r *http.Request) {
	tags, err := h.store.ListTags(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrTagQueryFailed).WithCause(err))
		return
	}

	items := make([]TagResponse, 0, len(tags))
	for _, t := range tags {
		items = append(items, TagResponse{
			Code:     t.Code,
			NameVi:   t.NameVi,
			NameZh:   t.NameZh,
			NameEn:   t.NameEn,
			Category: t.Category,
			UseCount: t.UseCount,
			IsPreset: t.IsPreset,
			IsActive: t.IsActive,
		})
	}

	response.JSON(w, http.StatusOK, items)
}

// ListAllTags handles GET /api/tags/all (Admin only).
func (h *Handler) ListAllTags(w http.ResponseWriter, r *http.Request) {
	tags, err := h.store.ListAllTags(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrTagQueryFailed).WithCause(err))
		return
	}

	items := make([]TagResponse, 0, len(tags))
	for _, t := range tags {
		items = append(items, TagResponse{
			Code:     t.Code,
			NameVi:   t.NameVi,
			NameZh:   t.NameZh,
			NameEn:   t.NameEn,
			Category: t.Category,
			UseCount: t.UseCount,
			IsPreset: t.IsPreset,
			IsActive: t.IsActive,
		})
	}

	response.JSON(w, http.StatusOK, items)
}

// UpdateTagStatusRequest defines payload to update tag active status.
type UpdateTagStatusRequest struct {
	IsActive bool `json:"is_active"`
}

// UpdateTagStatus handles PATCH /api/tags/{code}/status (Admin only).
func (h *Handler) UpdateTagStatus(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		code = r.PathValue("code")
	}
	if code == "" {
		code = r.URL.Query().Get("code")
	}

	var req UpdateTagStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	tag, err := h.store.UpdateTagActiveStatus(r.Context(), db.UpdateTagActiveStatusParams{
		Code:     code,
		IsActive: req.IsActive,
	})
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrTagUpdateFailed).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, TagResponse{
		Code:     tag.Code,
		NameVi:   tag.NameVi,
		NameZh:   tag.NameZh,
		NameEn:   tag.NameEn,
		Category: tag.Category,
		UseCount: tag.UseCount,
		IsPreset: tag.IsPreset,
		IsActive: tag.IsActive,
	})
}

// BatchUpdateTagsStatusRequest defines payload for batch activating/deactivating tags.
type BatchUpdateTagsStatusRequest struct {
	All      *bool    `json:"all"`
	Codes    []string `json:"codes"`
	IsActive bool     `json:"is_active"`
}

// BatchUpdateTagsStatus handles POST /api/tags/batch-status (Admin only).
func (h *Handler) BatchUpdateTagsStatus(w http.ResponseWriter, r *http.Request) {
	var req BatchUpdateTagsStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	if req.All != nil && *req.All {
		if err := h.store.SetAllTagsActiveStatus(r.Context(), req.IsActive); err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrTagUpdateFailed).WithCause(err))
			return
		}
		response.JSON(w, http.StatusOK, map[string]any{"success": true})
		return
	}

	// Update specific codes
	for _, code := range req.Codes {
		if _, err := h.store.UpdateTagActiveStatus(r.Context(), db.UpdateTagActiveStatusParams{
			Code:     code,
			IsActive: req.IsActive,
		}); err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrTagUpdateFailed).WithCause(err))
			return
		}
	}

	response.JSON(w, http.StatusOK, map[string]any{"success": true})
}

// UpsertTagRequest defines payload to create or update a tag.
type UpsertTagRequest struct {
	Code     string `json:"code"`
	NameVi   string `json:"name_vi"`
	NameZh   string `json:"name_zh"`
	NameEn   string `json:"name_en"`
	Category string `json:"category"`
	IsPreset bool   `json:"is_preset"`
}

// UpsertTag handles POST /api/tags (Admin only).
func (h *Handler) UpsertTag(w http.ResponseWriter, r *http.Request) {
	var req UpsertTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	if req.Code == "" || req.NameVi == "" || req.Category == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrTagMissingFields))
		return
	}
	tag, err := h.store.UpsertTag(r.Context(), db.UpsertTagParams{
		Code:     req.Code,
		NameVi:   req.NameVi,
		NameZh:   req.NameZh,
		NameEn:   req.NameEn,
		Category: req.Category,
		IsPreset: req.IsPreset,
	})
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrTagSaveFailed).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, TagResponse{
		Code:     tag.Code,
		NameVi:   tag.NameVi,
		NameZh:   tag.NameZh,
		NameEn:   tag.NameEn,
		Category: tag.Category,
		UseCount: tag.UseCount,
		IsPreset: tag.IsPreset,
		IsActive: tag.IsActive,
	})
}
