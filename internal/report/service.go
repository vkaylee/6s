package report

import (
	"context"
	"database/sql"
	"fmt"

	"6s/internal/auth"
	"6s/internal/db"
)

const maxExportRows = 100_000

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

// SummaryResponse formats the complete aggregation payload for ReportsPage.
type SummaryResponse struct {
	KPI        KPISummary              `json:"kpi"`
	Categories []CategoryBreakdownItem `json:"categories"`
	Trends     []TrendPoint            `json:"trends"`
	TopTags    []TagReportItem         `json:"topTags"`
}

// Store defines database operations required by report service.
type Store interface {
	GetReportKPISummary(ctx context.Context, locationCode sql.NullString) (db.GetReportKPISummaryRow, error)
	GetCategoryBreakdown(ctx context.Context, locationCode sql.NullString) ([]db.GetCategoryBreakdownRow, error)
	GetIssueTrends(ctx context.Context, arg db.GetIssueTrendsParams) ([]db.GetIssueTrendsRow, error)
	GetTopViolatedTags(ctx context.Context, arg db.GetTopViolatedTagsParams) ([]db.GetTopViolatedTagsRow, error)
	ListIssuesForExport(ctx context.Context, arg db.ListIssuesForExportParams) ([]db.ListIssuesForExportRow, error)
}

// Service provides reporting and analytics aggregations.
type Service interface {
	GetSummary(ctx context.Context, days int, locationCode string) (*SummaryResponse, error)
	GetExportData(ctx context.Context, status, category, locationCode string) ([]db.ListIssuesForExportRow, error)
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

	kpiRow, err := s.store.GetReportKPISummary(ctx, locParam)
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

	catRows, err := s.store.GetCategoryBreakdown(ctx, locParam)
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

	trendRows, err := s.store.GetIssueTrends(ctx, db.GetIssueTrendsParams{
		Column1:      int32(days), //nolint:gosec
		LocationCode: locParam,
	})
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

	tagRows, err := s.store.GetTopViolatedTags(ctx, db.GetTopViolatedTagsParams{
		Limit:        10,
		LocationCode: locParam,
	})
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

// GetExportData fetches at most maxExportRows issues visible to the authenticated user.
// The SQL query applies the same site and visibility policy as issue listing; the service cap protects alternate stores.
func (s *ServiceImpl) GetExportData(ctx context.Context, status, category, locationCode string) ([]db.ListIssuesForExportRow, error) {
	user, ok := auth.GetUserFromContext(ctx)
	if !ok || user.ID <= 0 || user.SiteID <= 0 {
		return nil, fmt.Errorf("authenticated user with site scope required for export")
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

	rows, err := s.store.ListIssuesForExport(ctx, db.ListIssuesForExportParams{
		Status:               statusParam,
		Category:             catParam,
		LocationCode:         locParam,
		SiteID:               user.SiteID,
		UserID:               user.ID,
		Role:                 user.Role,
		AssignedLocationCode: user.AssignedLocationCode,
	})
	if err != nil {
		return nil, err
	}
	if len(rows) > maxExportRows {
		rows = rows[:maxExportRows]
	}
	return rows, nil
}
