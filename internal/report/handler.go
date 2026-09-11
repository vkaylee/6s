// Package report provides reporting and XLSX export HTTP handlers.
package report

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"6s/internal/apperror"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// Handler handles HTTP requests for reporting and data export.
type Handler struct{ service Service }

// NewHandler creates a new report Handler.
func NewHandler(service Service) *Handler { return &Handler{service: service} }

// GetSummary handles GET /api/reports/summary?days=14&location_code=...
func (h *Handler) GetSummary(w http.ResponseWriter, r *http.Request) {
	days := 14
	if dStr := r.URL.Query().Get("days"); dStr != "" {
		if d, err := strconv.Atoi(dStr); err == nil && d > 0 && d <= 90 {
			days = d
		}
	}
	locationCode := r.URL.Query().Get("location_code")
	summary, err := h.service.GetSummary(r.Context(), days, locationCode)
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	_ = response.JSON(w, http.StatusOK, summary)
}

// ExportXLSX handles GET /api/issues/export as an XLSX workbook.
func (h *Handler) ExportXLSX(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.GetUserFromContext(r.Context()); !ok {
		_ = response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}
	rows, err := h.service.GetExportData(r.Context(), r.URL.Query().Get("status"), r.URL.Query().Get("category"), r.URL.Query().Get("location_code"))
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="6S_Issues_Export_%s.xlsx"`, time.Now().Format("20060102_150405")))
	_ = writeXLSX(w, rows)
}

func writeXLSX(w http.ResponseWriter, rows []db.ListIssuesForExportRow) error {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	parts := map[string]string{
		"[Content_Types].xml":        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
		"_rels/.rels":                `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
		"xl/workbook.xml":            `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Issues" sheetId="1" r:id="rId1"/></sheets></workbook>`,
	}
	for name, content := range parts {
		f, err := zw.Create(name)
		if err != nil {
			return err
		}
		if _, err = f.Write([]byte(content)); err != nil {
			return err
		}
	}
	f, err := zw.Create("xl/worksheets/sheet1.xml")
	if err != nil {
		return err
	}
	if _, err = fmt.Fprint(f, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`); err != nil {
		return err
	}
	writeRow := func(values []string, number int) error {
		if _, err := fmt.Fprintf(f, `<row r="%d">`, number); err != nil {
			return err
		}
		for col, value := range values {
			var escaped bytes.Buffer
			if err := xml.EscapeText(&escaped, []byte(value)); err != nil {
				return err
			}
			if _, err := fmt.Fprintf(f, `<c r="%s%d" t="inlineStr"><is><t>%s</t></is></c>`, columnName(col), number, escaped.String()); err != nil {
				return err
			}
		}
		_, err := fmt.Fprint(f, `</row>`)
		return err
	}
	header := []string{"ID", "UUID", "Category", "Location Code", "Location Name (VI)", "Location Name (ZH)", "Status", "Tags", "Description", "Reject Reason", "Reporter", "Resolver", "Score Rating", "Created At", "Resolved At", "Closed At"}
	if err := writeRow(header, 1); err != nil {
		return err
	}
	for i, row := range rows {
		if err := writeRow(exportValues(row), i+2); err != nil {
			return err
		}
	}
	if _, err = fmt.Fprint(f, `</sheetData></worksheet>`); err != nil {
		return err
	}
	if err = zw.Close(); err != nil {
		return err
	}
	_, err = w.Write(buf.Bytes())
	return err
}

func columnName(index int) string {
	result := ""
	for index >= 0 {
		result = string(rune('A'+index%26)) + result
		index = index/26 - 1
	}
	return result
}

func exportValues(row db.ListIssuesForExportRow) []string {
	desc, reject, resolver, score, resolvedAt, closedAt := "", "", "", "", "", ""
	if row.Description.Valid {
		desc = row.Description.String
	}
	if row.RejectReason.Valid {
		reject = row.RejectReason.String
	}
	if row.ResolverFullName.Valid {
		resolver = row.ResolverFullName.String
	} else if row.ResolverUsername.Valid {
		resolver = row.ResolverUsername.String
	}
	if row.ScoreRating.Valid {
		score = strconv.Itoa(int(row.ScoreRating.Int16))
	}
	if row.ResolvedAt.Valid {
		resolvedAt = row.ResolvedAt.Time.Format("2006-01-02 15:04:05")
	}
	if row.ClosedAt.Valid {
		closedAt = row.ClosedAt.Time.Format("2006-01-02 15:04:05")
	}
	return []string{strconv.FormatInt(row.ID, 10), row.ClientUuid, row.Category, row.LocationCode, row.LocationNameVi, row.LocationNameZh, row.Status, row.TagsString, desc, reject, row.CreatorFullName, resolver, score, row.CreatedAt.Format("2006-01-02 15:04:05"), resolvedAt, closedAt}
}
