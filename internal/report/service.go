package report

import (
	"context"
	"database/sql"
	"fmt"

	"6s/internal/db"
)

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
	GetReportKPISummary(ctx context.Context) (db.GetReportKPISummaryRow, error)
	GetCategoryBreakdown(ctx context.Context) ([]db.GetCategoryBreakdownRow, error)
	GetIssueTrends(ctx context.Context, days int32) ([]db.GetIssueTrendsRow, error)
	GetTopViolatedTags(ctx context.Context, limit int32) ([]db.GetTopViolatedTagsRow, error)
	ListIssuesForExport(ctx context.Context, arg db.ListIssuesForExportParams) ([]db.ListIssuesForExportRow, error)
}

// Service provides reporting and analytics aggregations.
type Service interface {
	GetSummary(ctx context.Context, days int) (*SummaryResponse, error)
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
func (s *ServiceImpl) GetSummary(ctx context.Context, days int) (*SummaryResponse, error) {
	if days <= 0 || days > 90 {
		days = 14
	}

	kpiRow, err := s.store.GetReportKPISummary(ctx)
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

	// 2. Category Breakdown
	catRows, err := s.store.GetCategoryBreakdown(ctx)
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

	// 3. Trends
	trendRows, err := s.store.GetIssueTrends(ctx, int32(days)) //nolint:gosec
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

	// 4. Top Tags
	tagRows, err := s.store.GetTopViolatedTags(ctx, 10)
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

// GetExportData fetches issues with associated tag codes for streaming CSV export.
func (s *ServiceImpl) GetExportData(ctx context.Context, status, category, locationCode string) ([]db.ListIssuesForExportRow, error) {
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

	return s.store.ListIssuesForExport(ctx, db.ListIssuesForExportParams{
		Status:       statusParam,
		Category:     catParam,
		LocationCode: locParam,
	})
}
