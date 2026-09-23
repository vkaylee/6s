package report

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"6s/internal/auth"
	"6s/internal/db"
)

const (
	maxExportRows      = 10_000
	maxExportRangeDays = 90
)

type reportBounds struct {
	DateFrom     time.Time
	DateTo       time.Time
	SiteID       int64
	LocationCode sql.NullString
	UserID       int64
	Role         string
}

func (b reportBounds) kpiParams() db.GetReportKPISummaryParams {
	return db.GetReportKPISummaryParams{
		DateFrom:     b.DateFrom,
		DateTo:       b.DateTo,
		SiteID:       b.SiteID,
		LocationCode: b.LocationCode,
		UserID:       b.UserID,
		Role:         b.Role,
	}
}

func (b reportBounds) categoryParams() db.GetCategoryBreakdownParams {
	return db.GetCategoryBreakdownParams{
		DateFrom:     b.DateFrom,
		DateTo:       b.DateTo,
		SiteID:       b.SiteID,
		LocationCode: b.LocationCode,
		UserID:       b.UserID,
		Role:         b.Role,
	}
}

func (b reportBounds) trendParams() db.GetIssueTrendsParams {
	return db.GetIssueTrendsParams{
		DateFrom:     b.DateFrom,
		DateTo:       b.DateTo,
		SiteID:       b.SiteID,
		LocationCode: b.LocationCode,
		UserID:       b.UserID,
		Role:         b.Role,
	}
}

func (b reportBounds) topTagParams(limit int32) db.GetTopViolatedTagsParams {
	return db.GetTopViolatedTagsParams{
		DateFrom:     b.DateFrom,
		DateTo:       b.DateTo,
		SiteID:       b.SiteID,
		LocationCode: b.LocationCode,
		UserID:       b.UserID,
		Role:         b.Role,
		Limit:        limit,
	}
}

// KPISummary matches the executive dashboard summary requirements.
type KPISummary struct {
	TotalIssues         int64 `json:"totalIssues"`
	OpenIssues          int64 `json:"openIssues"`
	PendingReviewIssues int64 `json:"pendingReviewIssues"`
	ClosedIssues        int64 `json:"closedIssues"`
	InvalidIssues       int64 `json:"invalidIssues"`
	SafetyIssues        int64 `json:"safetyIssues"`
	OverdueIssues       int64 `json:"overdueIssues"`
	ResolutionRate      int64 `json:"resolutionRate"` // percentage 0 - 100
}

// CategoryBreakdownItem represents the count and percentage per 6S category.
type CategoryBreakdownItem struct {
	Category   string `json:"category"`
	Count      int64  `json:"count"`
	Percentage int64  `json:"percentage"`
}

// TrendPoint represents daily issue creation and resolution activity.
type TrendPoint struct {
	Date     string `json:"date"` // YYYY-MM-DD
	Created  int64  `json:"created"`
	Resolved int64  `json:"resolved"`
}

// TagReportItem represents top violated tags.
type TagReportItem struct {
	TagCode  string `json:"tag_code"`
	Category string `json:"category"`
	NameVi   string `json:"name_vi"`
	NameZh   string `json:"name_zh"`
	NameEn   string `json:"name_en"`
	Count    int64  `json:"count"`
}

// TeamKPI is the site-scoped processing KPI for one team.
type TeamKPI struct {
	TeamID              int64  `json:"team_id"`
	TeamName            string `json:"team_name"`
	AssignedCount       int64  `json:"assigned_count"`
	OpenCount           int64  `json:"open_count"`
	OverdueCount        int64  `json:"overdue_count"`
	ClosedCount         int64  `json:"closed_count"`
	ConfirmedCauseCount int64  `json:"confirmed_cause_count"`
}

// ExportTeamFilter contains optional filters for issue exports.
type ExportTeamFilter struct {
	AssignedTeamID *int64
	MineTeam       *bool
	DateRange      ExportDateRange
}

// ExportDateRange bounds the issue creation window of an export as [From, To).
type ExportDateRange struct {
	From time.Time
	To   time.Time
}

// SummaryResponse formats the complete aggregation payload for ReportsPage.
type SummaryResponse struct {
	KPI        KPISummary              `json:"kpi"`
	Categories []CategoryBreakdownItem `json:"categories"`
	Trends     []TrendPoint            `json:"trends"`
	TopTags    []TagReportItem         `json:"topTags"`
}

// Store defines database operations required by report service.
type Store interface {
	GetReportKPISummary(ctx context.Context, arg db.GetReportKPISummaryParams) (db.GetReportKPISummaryRow, error)
	GetCategoryBreakdown(ctx context.Context, arg db.GetCategoryBreakdownParams) ([]db.GetCategoryBreakdownRow, error)
	GetIssueTrends(ctx context.Context, arg db.GetIssueTrendsParams) ([]db.GetIssueTrendsRow, error)
	GetTopViolatedTags(ctx context.Context, arg db.GetTopViolatedTagsParams) ([]db.GetTopViolatedTagsRow, error)
	ListIssuesForExport(ctx context.Context, arg db.ListIssuesForExportParams) ([]db.ListIssuesForExportRow, error)
	ListTeamKPIs(ctx context.Context, arg db.ListTeamKPIsParams) ([]db.ListTeamKPIsRow, error)
}

// Service provides reporting and analytics aggregations.
type Service interface {
	GetSummary(ctx context.Context, days int, locationCode string) (*SummaryResponse, error)
	GetExportData(ctx context.Context, status, category, locationCode string, teamFilters ...ExportTeamFilter) ([]db.ListIssuesForExportRow, error)
	GetTeamKPIs(ctx context.Context, days int) ([]TeamKPI, error)
}

// ServiceImpl implements Service interface.
type ServiceImpl struct {
	store Store
}

// NewService creates a new report Service.
func NewService(store Store) *ServiceImpl {
	return &ServiceImpl{store: store}
}

// GetSummary aggregates all report charts and metrics in high-efficiency DB queries.
func (s *ServiceImpl) GetSummary(ctx context.Context, days int, locationCode string) (*SummaryResponse, error) {
	if days <= 0 || days > 90 {
		days = 14
	}

	var locParam sql.NullString
	if locationCode != "" {
		locParam = sql.NullString{String: locationCode, Valid: true}
	}
	user, _ := auth.GetUserFromContext(ctx)
	today := time.Now().UTC().Truncate(24 * time.Hour)
	bounds := reportBounds{
		DateFrom:     today.AddDate(0, 0, -(days - 1)),
		DateTo:       today.AddDate(0, 0, 1),
		SiteID:       user.SiteID,
		LocationCode: locParam,
		UserID:       user.ID,
		Role:         user.Role,
	}

	kpiRow, err := s.store.GetReportKPISummary(ctx, bounds.kpiParams())
	if err != nil {
		return nil, fmt.Errorf("get kpi summary: %w", err)
	}

	validTotal := kpiRow.ClosedIssues + kpiRow.OpenIssues + kpiRow.PendingReviewIssues
	var resRate int64
	if validTotal > 0 {
		resRate = (kpiRow.ClosedIssues * 100) / validTotal
	}

	kpi := KPISummary{
		TotalIssues:         kpiRow.TotalIssues,
		OpenIssues:          kpiRow.OpenIssues,
		PendingReviewIssues: kpiRow.PendingReviewIssues,
		ClosedIssues:        kpiRow.ClosedIssues,
		InvalidIssues:       kpiRow.InvalidIssues,
		SafetyIssues:        kpiRow.SafetyIssues,
		OverdueIssues:       kpiRow.OverdueIssues,
		ResolutionRate:      resRate,
	}

	catRows, err := s.store.GetCategoryBreakdown(ctx, bounds.categoryParams())
	if err != nil {
		return nil, fmt.Errorf("get category breakdown: %w", err)
	}

	counts := make(map[string]int64)
	for _, row := range catRows {
		counts[row.Category] = row.Count
	}

	categories := []string{"1S", "2S", "3S", "4S", "5S", "6S"}
	catBreakdown := make([]CategoryBreakdownItem, 0, len(categories))
	for _, cat := range categories {
		c := counts[cat]
		var pct int64
		if kpi.TotalIssues > 0 {
			pct = (c * 100) / kpi.TotalIssues
		}
		catBreakdown = append(catBreakdown, CategoryBreakdownItem{
			Category:   cat,
			Count:      c,
			Percentage: pct,
		})
	}

	trendRows, err := s.store.GetIssueTrends(ctx, bounds.trendParams())
	if err != nil {
		return nil, fmt.Errorf("get issue trends: %w", err)
	}

	trends := make([]TrendPoint, 0, len(trendRows))
	for _, tr := range trendRows {
		trends = append(trends, TrendPoint{
			Date:     tr.DateKey.Format("2006-01-02"),
			Created:  tr.CreatedCount,
			Resolved: tr.ResolvedCount,
		})
	}

	tagRows, err := s.store.GetTopViolatedTags(ctx, bounds.topTagParams(10))
	if err != nil {
		return nil, fmt.Errorf("get top tags: %w", err)
	}

	topTags := make([]TagReportItem, 0, len(tagRows))
	for _, t := range tagRows {
		topTags = append(topTags, TagReportItem{
			TagCode:  t.TagCode,
			Category: t.Category,
			NameVi:   t.NameVi,
			NameZh:   t.NameZh,
			NameEn:   t.NameEn,
			Count:    t.ViolationCount,
		})
	}

	return &SummaryResponse{
		KPI:        kpi,
		Categories: catBreakdown,
		Trends:     trends,
		TopTags:    topTags,
	}, nil
}

// GetExportData fetches bounded, site-scoped issue rows for export.
func (s *ServiceImpl) GetExportData(ctx context.Context, status, category, locationCode string, teamFilters ...ExportTeamFilter) ([]db.ListIssuesForExportRow, error) {
	user, ok := auth.GetUserFromContext(ctx)
	if !ok || user.ID <= 0 || user.SiteID <= 0 {
		return nil, fmt.Errorf("authenticated user with site scope required for export")
	}
	dateRange := ExportDateRange{}
	if len(teamFilters) > 0 {
		dateRange = teamFilters[0].DateRange
	}
	if dateRange.From.IsZero() && dateRange.To.IsZero() {
		today := time.Now().UTC().Truncate(24 * time.Hour)
		dateRange = ExportDateRange{From: today.AddDate(0, 0, -29), To: today.AddDate(0, 0, 1)}
	}
	if dateRange.From.IsZero() || dateRange.To.IsZero() || !dateRange.To.After(dateRange.From) || dateRange.To.Sub(dateRange.From) > maxExportRangeDays*24*time.Hour {
		return nil, fmt.Errorf("export date range must be between 1 and %d days", maxExportRangeDays)
	}
	var statusParam, catParam, locParam sql.NullString
	if status != "" {
		statusParam = sql.NullString{String: status, Valid: true}
	}
	if category != "" {
		catParam = sql.NullString{String: category, Valid: true}
	}
	if locationCode != "" {
		locParam = sql.NullString{String: locationCode, Valid: true}
	}
	var assignedTeamID sql.NullInt64
	var mineTeam sql.NullBool
	if len(teamFilters) > 0 {
		if teamFilters[0].AssignedTeamID != nil {
			assignedTeamID = sql.NullInt64{Int64: *teamFilters[0].AssignedTeamID, Valid: true}
		}
		if teamFilters[0].MineTeam != nil {
			mineTeam = sql.NullBool{Bool: *teamFilters[0].MineTeam, Valid: true}
		}
	}

	rows, err := s.store.ListIssuesForExport(ctx, db.ListIssuesForExportParams{
		Status: statusParam, Category: catParam, LocationCode: locParam,
		AssignedTeamID: assignedTeamID, MineTeam: mineTeam,
		UserID: user.ID, DateFrom: sql.NullTime{Time: dateRange.From, Valid: true}, DateTo: sql.NullTime{Time: dateRange.To, Valid: true},
		SiteID: user.SiteID, Role: user.Role,
	})
	if err != nil {
		return nil, err
	}
	if len(rows) > maxExportRows {
		rows = rows[:maxExportRows]
	}
	return rows, nil
}

// GetTeamKPIs returns site-scoped team processing metrics for the requested window.
func (s *ServiceImpl) GetTeamKPIs(ctx context.Context, days int) ([]TeamKPI, error) {
	user, ok := auth.GetUserFromContext(ctx)
	if !ok || user.ID <= 0 || user.SiteID <= 0 {
		return nil, fmt.Errorf("authenticated user with site scope required for team report")
	}
	if days < 1 || days > 90 {
		days = 14
	}
	rows, err := s.store.ListTeamKPIs(ctx, db.ListTeamKPIsParams{Days: int32(days), SiteID: user.SiteID}) //nolint:gosec
	if err != nil {
		return nil, fmt.Errorf("list team kpis: %w", err)
	}
	out := make([]TeamKPI, 0, len(rows))
	for _, row := range rows {
		out = append(out, TeamKPI{
			TeamID: row.TeamID, TeamName: row.TeamName, AssignedCount: row.AssignedCount,
			OpenCount: row.OpenCount, OverdueCount: row.OverdueCount,
			ClosedCount: row.ClosedCount, ConfirmedCauseCount: row.ConfirmedCauseCount,
		})
	}
	return out, nil
}
