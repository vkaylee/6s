package report_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"6s/internal/db"
	"6s/internal/report"
)

type mockReportStore struct {
	kpi        db.GetReportKPISummaryRow
	categories []db.GetCategoryBreakdownRow
	trends     []db.GetIssueTrendsRow
	tags       []db.GetTopViolatedTagsRow
	exports    []db.ListIssuesForExportRow
	err        error
}

func (m *mockReportStore) GetReportKPISummary(_ context.Context) (db.GetReportKPISummaryRow, error) {
	return m.kpi, m.err
}

func (m *mockReportStore) GetCategoryBreakdown(_ context.Context) ([]db.GetCategoryBreakdownRow, error) {
	return m.categories, m.err
}

func (m *mockReportStore) GetIssueTrends(_ context.Context, _ int32) ([]db.GetIssueTrendsRow, error) {
	return m.trends, m.err
}

func (m *mockReportStore) GetTopViolatedTags(_ context.Context, _ int32) ([]db.GetTopViolatedTagsRow, error) {
	return m.tags, m.err
}

func (m *mockReportStore) ListIssuesForExport(_ context.Context, _ db.ListIssuesForExportParams) ([]db.ListIssuesForExportRow, error) {
	return m.exports, m.err
}

func TestReportService_GetSummary(t *testing.T) {
	store := &mockReportStore{
		kpi: db.GetReportKPISummaryRow{
			TotalIssues:         100,
			OpenIssues:          30,
			PendingReviewIssues: 10,
			ClosedIssues:        60,
			InvalidIssues:       0,
			SafetyIssues:        15,
			OverdueIssues:       5,
		},
		categories: []db.GetCategoryBreakdownRow{
			{Category: "1S", Count: 20},
			{Category: "2S", Count: 25},
			{Category: "6S", Count: 15},
		},
		trends: []db.GetIssueTrendsRow{
			{DateKey: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), CreatedCount: 5, ResolvedCount: 3},
		},
		tags: []db.GetTopViolatedTagsRow{
			{TagCode: "fire_hazard", Category: "6S", NameVi: "Nguy cơ cháy", ViolationCount: 10},
		},
	}

	svc := report.NewService(store)
	res, err := svc.GetSummary(context.Background(), 14)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.KPI.TotalIssues != 100 {
		t.Errorf("expected 100 total issues, got %d", res.KPI.TotalIssues)
	}
	// validTotal = 60 + 30 + 10 = 100 -> resolutionRate = (60 * 100) / 100 = 60%
	if res.KPI.ResolutionRate != 60 {
		t.Errorf("expected 60 resolution rate, got %d", res.KPI.ResolutionRate)
	}
	if len(res.Categories) != 6 {
		t.Errorf("expected 6 categories breakdown, got %d", len(res.Categories))
	}
	if len(res.Trends) != 1 {
		t.Errorf("expected 1 trend point, got %d", len(res.Trends))
	}
	if len(res.TopTags) != 1 || res.TopTags[0].TagCode != "fire_hazard" {
		t.Errorf("expected top tag fire_hazard, got %+v", res.TopTags)
	}
}

func TestReportHandler_GetSummary(t *testing.T) {
	store := &mockReportStore{
		kpi: db.GetReportKPISummaryRow{
			TotalIssues:  10,
			ClosedIssues: 8,
			OpenIssues:   2,
		},
	}
	svc := report.NewService(store)
	h := report.NewHandler(svc)

	req := httptest.NewRequest("GET", "/api/reports/summary?days=7", nil)
	rr := httptest.NewRecorder()
	h.GetSummary(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var env struct {
		Data report.SummaryResponse `json:"data"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&env); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if env.Data.KPI.TotalIssues != 10 {
		t.Errorf("expected 10 total issues in json, got %d", env.Data.KPI.TotalIssues)
	}
}

func TestReportHandler_ExportCSV(t *testing.T) {
	store := &mockReportStore{
		exports: []db.ListIssuesForExportRow{
			{
				ID:              1,
				ClientUuid:      "11111111-2222-3333-4444-555555555555",
				Category:        "6S",
				LocationCode:    "LINE_A1",
				LocationNameVi:  "Chuyền A1",
				TagsString:      "exposed_wire; safety_gear",
				Status:          "OPEN",
				Description:     sql.NullString{String: "Dây điện hở", Valid: true},
				CreatorFullName: "Nguyễn Văn A",
				CreatedAt:       time.Date(2026, 9, 5, 8, 30, 0, 0, time.UTC),
			},
		},
	}
	svc := report.NewService(store)
	h := report.NewHandler(svc)

	req := httptest.NewRequest("GET", "/api/issues/export", nil)
	rr := httptest.NewRecorder()
	h.ExportCSV(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	contentType := rr.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/csv") {
		t.Errorf("expected text/csv, got %s", contentType)
	}
	body := rr.Body.String()
	// Check UTF-8 BOM
	if !strings.HasPrefix(body, "\xef\xbb\xbf") {
		t.Errorf("expected UTF-8 BOM at start of CSV")
	}
	if !strings.Contains(body, "Chuyền A1") || !strings.Contains(body, "exposed_wire; safety_gear") {
		t.Errorf("CSV body missing expected record data: %s", body)
	}
}
