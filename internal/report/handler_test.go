package report_test

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/report"
)

type mockReportStore struct {
	kpi        db.GetReportKPISummaryRow
	categories []db.GetCategoryBreakdownRow
	trends     []db.GetIssueTrendsRow
	tags       []db.GetTopViolatedTagsRow
	exports    []db.ListIssuesForExportRow
	teamKPIs   []db.ListTeamKPIsRow
	exportArg  db.ListIssuesForExportParams
	kpiArg     db.GetReportKPISummaryParams
	catArg     db.GetCategoryBreakdownParams
	trendsArg  db.GetIssueTrendsParams
	tagsArg    db.GetTopViolatedTagsParams
	err        error
}

func (m *mockReportStore) GetReportKPISummary(_ context.Context, arg db.GetReportKPISummaryParams) (db.GetReportKPISummaryRow, error) {
	m.kpiArg = arg
	return m.kpi, m.err
}

func (m *mockReportStore) GetCategoryBreakdown(_ context.Context, arg db.GetCategoryBreakdownParams) ([]db.GetCategoryBreakdownRow, error) {
	m.catArg = arg
	return m.categories, m.err
}

func (m *mockReportStore) GetIssueTrends(_ context.Context, arg db.GetIssueTrendsParams) ([]db.GetIssueTrendsRow, error) {
	m.trendsArg = arg
	return m.trends, m.err
}

func (m *mockReportStore) GetTopViolatedTags(_ context.Context, arg db.GetTopViolatedTagsParams) ([]db.GetTopViolatedTagsRow, error) {
	m.tagsArg = arg
	return m.tags, m.err
}
func (m *mockReportStore) ListIssuesForExport(_ context.Context, arg db.ListIssuesForExportParams) ([]db.ListIssuesForExportRow, error) {
	m.exportArg = arg
	return m.exports, m.err
}

func (m *mockReportStore) ListTeamKPIs(_ context.Context, _ db.ListTeamKPIsParams) ([]db.ListTeamKPIsRow, error) {
	return m.teamKPIs, m.err
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
	res, err := svc.GetSummary(context.Background(), 14, "")
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
func TestReportService_GetSummary_BoundsParametersPassed(t *testing.T) {
	store := &mockReportStore{
		kpi: db.GetReportKPISummaryRow{TotalIssues: 5},
	}
	svc := report.NewService(store)

	user := db.User{
		ID:     42,
		SiteID: 9,
		Role:   auth.RoleLineLeader.String(),
	}
	ctx := context.WithValue(context.Background(), auth.UserContextKey, user)

	// Request 30 days with location filter
	_, err := svc.GetSummary(ctx, 30, "LINE_A1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 1. Verify KPI query bounds
	if store.kpiArg.SiteID != 9 || store.kpiArg.UserID != 42 || store.kpiArg.Role != auth.RoleLineLeader.String() {
		t.Errorf("KPI query site/user/role mismatch: %+v", store.kpiArg)
	}
	if !store.kpiArg.LocationCode.Valid || store.kpiArg.LocationCode.String != "LINE_A1" {
		t.Errorf("KPI query location mismatch: %+v", store.kpiArg.LocationCode)
	}
	expectedDuration := 30 * 24 * time.Hour
	if diff := store.kpiArg.DateTo.Sub(store.kpiArg.DateFrom); diff != expectedDuration {
		t.Errorf("KPI query date window expected %v, got %v", expectedDuration, diff)
	}

	// 2. Verify Category Breakdown query bounds
	if store.catArg.SiteID != 9 || store.catArg.UserID != 42 || store.catArg.Role != auth.RoleLineLeader.String() {
		t.Errorf("Category query site/user/role mismatch: %+v", store.catArg)
	}
	if store.catArg.DateFrom != store.kpiArg.DateFrom || store.catArg.DateTo != store.kpiArg.DateTo {
		t.Errorf("Category query date range mismatch: %+v vs %+v", store.catArg, store.kpiArg)
	}

	// 3. Verify Issue Trends query bounds
	if store.trendsArg.SiteID != 9 || store.trendsArg.UserID != 42 || store.trendsArg.Role != auth.RoleLineLeader.String() {
		t.Errorf("Trends query site/user/role mismatch: %+v", store.trendsArg)
	}
	if store.trendsArg.DateFrom != store.kpiArg.DateFrom || store.trendsArg.DateTo != store.kpiArg.DateTo {
		t.Errorf("Trends query date range mismatch: %+v vs %+v", store.trendsArg, store.kpiArg)
	}

	// 4. Verify Top Violated Tags query bounds
	if store.tagsArg.SiteID != 9 || store.tagsArg.UserID != 42 || store.tagsArg.Role != auth.RoleLineLeader.String() {
		t.Errorf("TopTags query site/user/role mismatch: %+v", store.tagsArg)
	}
	if store.tagsArg.DateFrom != store.kpiArg.DateFrom || store.tagsArg.DateTo != store.kpiArg.DateTo {
		t.Errorf("TopTags query date range mismatch: %+v vs %+v", store.tagsArg, store.kpiArg)
	}
	if store.tagsArg.Limit != 10 {
		t.Errorf("TopTags limit expected 10, got %d", store.tagsArg.Limit)
	}

	// 5. Test clamping out-of-range days to 14
	_, err = svc.GetSummary(ctx, 120, "")
	if err != nil {
		t.Fatalf("unexpected error on clamped summary: %v", err)
	}
	clampedDuration := 14 * 24 * time.Hour
	if diff := store.kpiArg.DateTo.Sub(store.kpiArg.DateFrom); diff != clampedDuration {
		t.Errorf("expected clamped 14 days window (%v), got %v", clampedDuration, diff)
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

func TestReportHandler_ExportXLSX(t *testing.T) {
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
	user := db.User{ID: 10, Role: "ADMIN", SiteID: 1, IsActive: true}

	req := httptest.NewRequest("GET", "/api/issues/export", nil)
	req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, user))
	rr := httptest.NewRecorder()
	h.ExportXLSX(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	contentType := rr.Header().Get("Content-Type")
	if !strings.Contains(contentType, "openxmlformats-officedocument.spreadsheetml.sheet") {
		t.Errorf("expected xlsx content-type, got %s", contentType)
	}
	body := rr.Body.Bytes()
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("failed to open xlsx zip: %v", err)
	}
	var sheetContent string
	for _, f := range zr.File {
		if f.Name == "xl/worksheets/sheet1.xml" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			_ = rc.Close()
			sheetContent = string(b)
			break
		}
	}
	if !strings.Contains(sheetContent, "Chuyền A1") || !strings.Contains(sheetContent, "exposed_wire; safety_gear") {
		t.Errorf("xlsx missing expected record data: %s", sheetContent)
	}
}

func TestReport_ErrorAndFilterBranches(t *testing.T) {
	errStore := &mockReportStore{err: errors.New("db error")}
	errSvc := report.NewService(errStore)
	errHandler := report.NewHandler(errSvc)

	// 1. GetSummary error
	reqErrSum := httptest.NewRequest("GET", "/api/reports/summary", nil)
	rrErrSum := httptest.NewRecorder()
	errHandler.GetSummary(rrErrSum, reqErrSum)
	if rrErrSum.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on summary error, got %d", rrErrSum.Code)
	}
	// 2. ExportXLSX error
	user := db.User{ID: 10, Role: "ADMIN", SiteID: 1, IsActive: true}
	reqErrExp := httptest.NewRequest("GET", "/api/issues/export", nil)
	reqErrExp = reqErrExp.WithContext(context.WithValue(reqErrExp.Context(), auth.UserContextKey, user))
	rrErrExp := httptest.NewRecorder()
	errHandler.ExportXLSX(rrErrExp, reqErrExp)
	if rrErrExp.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 on export error, got %d", rrErrExp.Code)
	}

	// 3. Export with filters (status, category, location)
	validStore := &mockReportStore{
		exports: []db.ListIssuesForExportRow{
			{
				ID:           2,
				Category:     "1S",
				Status:       "CLOSED",
				LocationCode: "LOC1",
				ResolvedAt:   sql.NullTime{Time: time.Now(), Valid: true},
				ClosedAt:     sql.NullTime{Time: time.Now(), Valid: true},
				RejectReason: sql.NullString{String: "Reason", Valid: true},
			},
		},
	}
	validSvc := report.NewService(validStore)
	validHandler := report.NewHandler(validSvc)
	reqFilter := httptest.NewRequest("GET", "/api/issues/export?status=CLOSED&category=1S&location_code=LOC1", nil)
	reqFilter = reqFilter.WithContext(context.WithValue(reqFilter.Context(), auth.UserContextKey, user))
	rrFilter := httptest.NewRecorder()
	validHandler.ExportXLSX(rrFilter, reqFilter)
	if rrFilter.Code != http.StatusOK {
		t.Errorf("expected 200 for filtered export, got %d", rrFilter.Code)
	}

	// 4. Summary with invalid days query
	reqBadDays := httptest.NewRequest("GET", "/api/reports/summary?days=invalid", nil)
	rrBadDays := httptest.NewRecorder()
	validHandler.GetSummary(rrBadDays, reqBadDays)
	if rrBadDays.Code != http.StatusOK {
		t.Errorf("expected 200 for invalid days param falling back to default, got %d", rrBadDays.Code)
	}

	// 5. Service days out of range (< 0 or > 90)
	_, errOutOfRange := validSvc.GetSummary(context.Background(), 150, "")
	if errOutOfRange != nil {
		t.Errorf("expected GetSummary to clamp days, got %v", errOutOfRange)
	}
}

func TestReportService_GetExportDataBoundsRows(t *testing.T) {
	rows := make([]db.ListIssuesForExportRow, 10_001)
	for i := range rows {
		rows[i].ID = int64(i + 1)
	}
	service := report.NewService(&mockReportStore{exports: rows})
	ctx := context.WithValue(context.Background(), auth.UserContextKey, db.User{
		ID:     5,
		SiteID: 2,
		Role:   "ADMIN",
	})

	got, err := service.GetExportData(ctx, "", "", "")
	if err != nil {
		t.Fatalf("GetExportData error: %v", err)
	}
	if len(got) != 10_000 {
		t.Fatalf("expected export bound of 10000 rows, got %d", len(got))
	}
	if got[0].ID != 1 || got[len(got)-1].ID != 10_000 {
		t.Fatalf("unexpected rows after export bound: first=%d last=%d", got[0].ID, got[len(got)-1].ID)
	}
}

func TestReportHandler_ExportXLSX_Unauthorized(t *testing.T) {
	svc := report.NewService(&mockReportStore{})
	h := report.NewHandler(svc)

	req := httptest.NewRequest("GET", "/api/issues/export", nil)
	rr := httptest.NewRecorder()
	h.ExportXLSX(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 unauthorized, got %d", rr.Code)
	}
}

func TestReportService_GetExportData_RequiresAuthenticatedSite(t *testing.T) {
	svc := report.NewService(&mockReportStore{})

	// Unauthenticated
	if _, err := svc.GetExportData(context.Background(), "", "", ""); err == nil {
		t.Fatalf("expected error without user in context")
	}

	// Missing site_id
	ctxNoSite := context.WithValue(context.Background(), auth.UserContextKey, db.User{ID: 1, Role: "ADMIN"})
	if _, err := svc.GetExportData(ctxNoSite, "", "", ""); err == nil {
		t.Fatalf("expected error without site_id")
	}
}

func TestReportService_GetExportData_DefaultsAndBoundsDateRange(t *testing.T) {
	user := db.User{ID: 7, SiteID: 3, Role: "ADMIN"}
	ctx := context.WithValue(context.Background(), auth.UserContextKey, user)
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }

	t.Run("missing range defaults to recent 30 days", func(t *testing.T) {
		store := &mockReportStore{}
		svc := report.NewService(store)
		if _, err := svc.GetExportData(ctx, "", "", ""); err != nil {
			t.Fatalf("GetExportData error: %v", err)
		}
		if !store.exportArg.DateFrom.Valid || !store.exportArg.DateTo.Valid {
			t.Fatalf("expected default date bounds to reach the store")
		}
		span := store.exportArg.DateTo.Time.Sub(store.exportArg.DateFrom.Time)
		if span != 30*24*time.Hour {
			t.Fatalf("expected 30 day default window, got %v", span)
		}
	})

	t.Run("range wider than 90 days is rejected", func(t *testing.T) {
		store := &mockReportStore{}
		svc := report.NewService(store)
		_, err := svc.GetExportData(ctx, "", "", "", report.ExportTeamFilter{
			DateRange: report.ExportDateRange{From: day(2026, time.January, 1), To: day(2026, time.June, 1)},
		})
		if err == nil {
			t.Fatalf("expected oversized date range to be rejected")
		}
	})

	t.Run("reversed range is rejected", func(t *testing.T) {
		store := &mockReportStore{}
		svc := report.NewService(store)
		_, err := svc.GetExportData(ctx, "", "", "", report.ExportTeamFilter{
			DateRange: report.ExportDateRange{From: day(2026, time.March, 5), To: day(2026, time.March, 1)},
		})
		if err == nil {
			t.Fatalf("expected reversed date range to be rejected")
		}
	})
}

func TestReportHandler_ExportXLSX_DateRangeValidation(t *testing.T) {
	store := &mockReportStore{}
	handler := report.NewHandler(report.NewService(store))
	user := db.User{ID: 10, Role: "ADMIN", SiteID: 1, IsActive: true}
	request := func(query string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/api/issues/export"+query, nil)
		req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, user))
		rr := httptest.NewRecorder()
		handler.ExportXLSX(rr, req)
		return rr
	}

	if rr := request("?date_from=2026-01-01&date_to=2026-06-01"); rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for 152 day range, got %d", rr.Code)
	}
	if rr := request("?date_from=2026-01-01"); rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for partial date range, got %d", rr.Code)
	}
	if rr := request("?date_from=01-01-2026&date_to=2026-01-31"); rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for malformed date, got %d", rr.Code)
	}

	rr := request("?date_from=2026-01-01&date_to=2026-01-31")
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 for bounded range, got %d", rr.Code)
	}
	if !store.exportArg.DateFrom.Valid || !store.exportArg.DateTo.Valid {
		t.Fatalf("expected bounded range to reach the store")
	}
	if store.exportArg.DateFrom.Time.Format("2006-01-02") != "2026-01-01" {
		t.Fatalf("unexpected lower bound %v", store.exportArg.DateFrom.Time)
	}
	if store.exportArg.DateTo.Time.Format("2006-01-02") != "2026-02-01" {
		t.Fatalf("expected exclusive upper bound 2026-02-01, got %v", store.exportArg.DateTo.Time)
	}
}
