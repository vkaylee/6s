package report

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"6s/internal/apperror"
	"6s/internal/i18n"
	"6s/internal/response"
)

// Handler handles HTTP requests for reporting and data export.
type Handler struct {
	service Service
}

// NewHandler creates a new report Handler.
func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

// GetSummary handles GET /api/reports/summary?days=14.
func (h *Handler) GetSummary(w http.ResponseWriter, r *http.Request) {
	days := 14
	if dStr := r.URL.Query().Get("days"); dStr != "" {
		if d, err := strconv.Atoi(dStr); err == nil && d > 0 && d <= 90 {
			days = d
		}
	}

	summary, err := h.service.GetSummary(r.Context(), days)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, summary)
}

// ExportCSV handles GET /api/issues/export (streams CSV with UTF-8 BOM for Excel).
func (h *Handler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	category := r.URL.Query().Get("category")
	locationCode := r.URL.Query().Get("location_code")

	rows, err := h.service.GetExportData(r.Context(), status, category, locationCode)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	filename := fmt.Sprintf("6S_Issues_Export_%s.csv", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))

	// UTF-8 BOM for Microsoft Excel compatibility
	if _, wErr := w.Write([]byte{0xEF, 0xBB, 0xBF}); wErr != nil {
		return
	}
	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Header row
	header := []string{
		"ID",
		"UUID",
		"Category",
		"Location Code",
		"Location Name (VI)",
		"Location Name (ZH)",
		"Status",
		"Tags",
		"Description",
		"Reject Reason",
		"Reporter",
		"Resolver",
		"Score Rating",
		"Created At",
		"Resolved At",
		"Closed At",
	}
	if err := writer.Write(header); err != nil {
		return
	}

	for _, row := range rows {
		desc := ""
		if row.Description.Valid {
			desc = row.Description.String
		}
		reject := ""
		if row.RejectReason.Valid {
			reject = row.RejectReason.String
		}
		resolver := ""
		if row.ResolverFullName.Valid {
			resolver = row.ResolverFullName.String
		} else if row.ResolverUsername.Valid {
			resolver = row.ResolverUsername.String
		}

		score := ""
		if row.ScoreRating.Valid {
			score = strconv.Itoa(int(row.ScoreRating.Int16))
		}

		resolvedAt := ""
		if row.ResolvedAt.Valid {
			resolvedAt = row.ResolvedAt.Time.Format("2006-01-02 15:04:05")
		}
		closedAt := ""
		if row.ClosedAt.Valid {
			closedAt = row.ClosedAt.Time.Format("2006-01-02 15:04:05")
		}

		tagsStr := row.TagsString

		record := []string{
			strconv.FormatInt(row.ID, 10),
			row.ClientUuid,
			row.Category,
			row.LocationCode,
			row.LocationNameVi,
			row.LocationNameZh,
			row.Status,
			tagsStr,
			desc,
			reject,
			row.CreatorFullName,
			resolver,
			score,
			row.CreatedAt.Format("2006-01-02 15:04:05"),
			resolvedAt,
			closedAt,
		}

		if err := writer.Write(record); err != nil {
			return
		}
	}
}
