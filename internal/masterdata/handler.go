package masterdata

import (
	"context"
	"encoding/json"
	"net/http"

	"6s/internal/apperror"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// Store defines repository queries for locations and tags.
type Store interface {
	ListLocations(ctx context.Context) ([]db.Location, error)
	CreateLocation(ctx context.Context, arg db.CreateLocationParams) (db.Location, error)
	ListTags(ctx context.Context) ([]db.Tag, error)
	UpsertTag(ctx context.Context, arg db.UpsertTagParams) (db.Tag, error)
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

// TagResponse formats tag for API.
type TagResponse struct {
	Code     string `json:"code"`
	NameVi   string `json:"name_vi"`
	NameZh   string `json:"name_zh"`
	NameEn   string `json:"name_en"`
	Category string `json:"category"`
	UseCount int32  `json:"use_count"`
	IsPreset bool   `json:"is_preset"`
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
		})
	}

	response.JSON(w, http.StatusOK, items)
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
	})
}
