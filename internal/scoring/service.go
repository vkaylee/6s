package scoring

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"time"

	"6s/internal/db"
)

// Scoring errors.
var (
	ErrMissingReason = errors.New("reason is required when apply_from is specified")
	ErrInvalidRules  = errors.New("invalid scoring rules")
)

// Store defines database operations required by the scoring service.
type Store interface {
	ListLocations(ctx context.Context) ([]db.Location, error)
	GetLocationScoreSumInWeek(ctx context.Context, arg db.GetLocationScoreSumInWeekParams) (int64, error)
	CountOpenIssuesByLocation(ctx context.Context, locationCode string) (int64, error)
	CountOverdueIssuesByLocation(ctx context.Context, locationCode string) (int64, error)
	GetReporterLeaderboardInMonth(ctx context.Context, createdAt time.Time) ([]db.GetReporterLeaderboardInMonthRow, error)
	GetScoringRules(ctx context.Context) ([]db.ScoringRule, error)
	GetScoringRuleByKey(ctx context.Context, ruleKey string) (db.ScoringRule, error)
	UpsertScoringRule(ctx context.Context, arg db.UpsertScoringRuleParams) (db.ScoringRule, error)
	ListScoreLogsSince(ctx context.Context, createdAt time.Time) ([]db.ScoreLog, error)
	ListScoreLogsByIssue(ctx context.Context, issueID int64) ([]db.ListScoreLogsByIssueRow, error)
	ListScoreLogsByTargetSince(ctx context.Context, arg db.ListScoreLogsByTargetSinceParams) ([]db.ListScoreLogsByTargetSinceRow, error)
	InsertScoreLog(ctx context.Context, arg db.InsertScoreLogParams) error
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// Service manages scoring algorithms, leaderboards, and retroactive adjustments.
type Service struct {
	store Store
	loc   *time.Location
}

// NewService creates a new scoring Service.
func NewService(store Store, loc *time.Location) *Service {
	if loc == nil {
		loc = time.FixedZone("ICT", 7*3600) // Default Vietnam +07:00
	}
	return &Service{
		store: store,
		loc:   loc,
	}
}

// LocationHealthItem represents one location in the health leaderboard.
type LocationHealthItem struct {
	LocationCode string `json:"location_code"`
	LocationName string `json:"location_name"`
	HealthScore  int64  `json:"health_score"`
	OpenCount    int64  `json:"open_count"`
	OverdueCount int64  `json:"overdue_count"`
}

// ReporterItem represents one top reporter in the leaderboard.
type ReporterItem struct {
	UserID      int64  `json:"user_id"`
	FullName    string `json:"full_name"`
	Points      int64  `json:"points"`
	ValidCount  int64  `json:"valid_count"`
	SafetyCount int64  `json:"safety_count"`
}

// ScoreLogItem represents one score transaction log.
type ScoreLogItem struct {
	ID               int64   `json:"id"`
	IssueID          int64   `json:"issue_id"`
	TargetType       string  `json:"target_type"`
	TargetID         string  `json:"target_id"`
	RuleKey          string  `json:"rule_key"`
	RuleDescription  string  `json:"rule_description"`
	Points           int32   `json:"points"`
	CreatedAt        string  `json:"created_at"`
	PenaltyDate      *string `json:"penalty_date,omitempty"`
	IssueCategory    string  `json:"issue_category,omitempty"`
	IssueDescription string  `json:"issue_description,omitempty"`
	IssueStatus      string  `json:"issue_status,omitempty"`
}

// StartOfWeek calculates Monday 00:00:00 of the current week in local timezone.
func StartOfWeek(t time.Time, loc *time.Location) time.Time {
	localTime := t.In(loc)
	weekday := int(localTime.Weekday())
	if weekday == 0 {
		weekday = 7 // ISO Sunday
	}
	daysToMonday := weekday - 1
	mon := localTime.AddDate(0, 0, -daysToMonday)
	return time.Date(mon.Year(), mon.Month(), mon.Day(), 0, 0, 0, 0, loc)
}

// StartOfMonth calculates the 1st of the month 00:00:00 in local timezone.
func StartOfMonth(t time.Time, loc *time.Location) time.Time {
	localTime := t.In(loc)
	return time.Date(localTime.Year(), localTime.Month(), 1, 0, 0, 0, 0, loc)
}

// GetLocationLeaderboard calculates real-time weekly health scores for all active locations.
func (s *Service) GetLocationLeaderboard(ctx context.Context) ([]LocationHealthItem, error) {
	locations, err := s.store.ListLocations(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list locations: %w", err)
	}

	startOfWeek := StartOfWeek(time.Now(), s.loc)
	baseScore := int64(100)
	if baseRule, bErr := s.store.GetScoringRuleByKey(ctx, "base_weekly_score"); bErr == nil {
		baseScore = int64(baseRule.Points)
	}

	items := make([]LocationHealthItem, 0, len(locations))
	for _, loc := range locations {
		sumPoints, sErr := s.store.GetLocationScoreSumInWeek(ctx, db.GetLocationScoreSumInWeekParams{
			TargetID:  loc.Code,
			CreatedAt: startOfWeek,
		})
		if sErr != nil {
			sumPoints = 0
		}

		rawScore := baseScore + sumPoints
		finalScore := rawScore
		if finalScore < 0 {
			finalScore = 0
		} else if finalScore > 120 {
			finalScore = 120
		}

		openCount, oErr := s.store.CountOpenIssuesByLocation(ctx, loc.Code)
		if oErr != nil {
			openCount = 0
		}
		overdueCount, odErr := s.store.CountOverdueIssuesByLocation(ctx, loc.Code)
		if odErr != nil {
			overdueCount = 0
		}

		items = append(items, LocationHealthItem{
			LocationCode: loc.Code,
			LocationName: loc.NameVi,
			HealthScore:  finalScore,
			OpenCount:    openCount,
			OverdueCount: overdueCount,
		})
	}

	// Sort from lowest score to highest to address hotspots first (SPEC.md 4.6.B)
	sort.Slice(items, func(i, j int) bool {
		if items[i].HealthScore == items[j].HealthScore {
			return items[i].OpenCount > items[j].OpenCount
		}
		return items[i].HealthScore < items[j].HealthScore
	})

	return items, nil
}

// GetReporterLeaderboard retrieves top 6S hunters for the current month.
func (s *Service) GetReporterLeaderboard(ctx context.Context) ([]ReporterItem, error) {
	startOfMonth := StartOfMonth(time.Now(), s.loc)
	rows, err := s.store.GetReporterLeaderboardInMonth(ctx, startOfMonth)
	if err != nil {
		return nil, fmt.Errorf("failed to get reporter leaderboard: %w", err)
	}

	items := make([]ReporterItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, ReporterItem{
			UserID:      r.UserID,
			FullName:    r.FullName,
			Points:      r.Points,
			ValidCount:  r.ValidCount,
			SafetyCount: r.SafetyCount,
		})
	}
	return items, nil
}

// GetRules returns current active scoring rules.
func (s *Service) GetRules(ctx context.Context) ([]db.ScoringRule, error) {
	return s.store.GetScoringRules(ctx)
}

// GetIssueScoreLogs retrieves score logs associated with a specific issue.
func (s *Service) GetIssueScoreLogs(ctx context.Context, issueID int64) ([]ScoreLogItem, error) {
	rows, err := s.store.ListScoreLogsByIssue(ctx, issueID)
	if err != nil {
		return nil, fmt.Errorf("failed to list score logs for issue: %w", err)
	}

	items := make([]ScoreLogItem, 0, len(rows))
	for _, r := range rows {
		var pDate *string
		if r.PenaltyDate.Valid {
			dStr := r.PenaltyDate.Time.Format("2006-01-02")
			pDate = &dStr
		}
		items = append(items, ScoreLogItem{
			ID:              r.ID,
			IssueID:         r.IssueID,
			TargetType:      r.TargetType,
			TargetID:        r.TargetID,
			RuleKey:         r.RuleKey,
			RuleDescription: r.RuleDescription,
			Points:          r.Points,
			CreatedAt:       r.CreatedAt.Format(time.RFC3339),
			PenaltyDate:     pDate,
		})
	}
	return items, nil
}

// GetTargetScoreLogsInCycle retrieves score logs for a target (LOCATION or USER) in their current cycle (week or month).
func (s *Service) GetTargetScoreLogsInCycle(ctx context.Context, targetType, targetID string) ([]ScoreLogItem, error) {
	var since time.Time
	if targetType == "LOCATION" {
		since = StartOfWeek(time.Now(), s.loc)
	} else {
		since = StartOfMonth(time.Now(), s.loc)
	}

	rows, err := s.store.ListScoreLogsByTargetSince(ctx, db.ListScoreLogsByTargetSinceParams{
		TargetType: targetType,
		TargetID:   targetID,
		CreatedAt:  since,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list target score logs: %w", err)
	}

	items := make([]ScoreLogItem, 0, len(rows))
	for _, r := range rows {
		var pDate *string
		if r.PenaltyDate.Valid {
			dStr := r.PenaltyDate.Time.Format("2006-01-02")
			pDate = &dStr
		}
		items = append(items, ScoreLogItem{
			ID:               r.ID,
			IssueID:          r.IssueID,
			TargetType:       r.TargetType,
			TargetID:         r.TargetID,
			RuleKey:          r.RuleKey,
			RuleDescription:  r.RuleDescription,
			Points:           r.Points,
			CreatedAt:        r.CreatedAt.Format(time.RFC3339),
			PenaltyDate:      pDate,
			IssueCategory:    r.IssueCategory,
			IssueDescription: r.IssueDescription,
			IssueStatus:      r.IssueStatus,
		})
	}
	return items, nil
}

// UpdateRulesRequest parameters for updating scoring rules.
type UpdateRulesRequest struct {
	Rules     map[string]int32 `json:"rules"`
	ApplyFrom *time.Time       `json:"apply_from,omitempty"`
	Reason    string           `json:"reason,omitempty"`
}

// UpdateRules updates scoring configuration and handles retroactive delta calculation.
func (s *Service) UpdateRules(ctx context.Context, req UpdateRulesRequest, adminUserID int64) error {
	if len(req.Rules) == 0 {
		return ErrInvalidRules
	}
	if req.ApplyFrom != nil && req.Reason == "" {
		return ErrMissingReason
	}

	oldRules, err := s.store.GetScoringRules(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch existing rules: %w", err)
	}
	oldMap := make(map[string]int32, len(oldRules))
	for _, r := range oldRules {
		oldMap[r.RuleKey] = r.Points
	}

	// 1. Update rules in DB
	for key, newPoints := range req.Rules {
		_, upsertErr := s.store.UpsertScoringRule(ctx, db.UpsertScoringRuleParams{
			RuleKey:     key,
			Points:      newPoints,
			Description: sql.NullString{},
		})
		if upsertErr != nil {
			return fmt.Errorf("failed to update rule %s: %w", key, upsertErr)
		}
	}

	// 2. Retroactive recalculation if apply_from provided
	if req.ApplyFrom != nil {
		if rErr := s.recalculateRetroactive(ctx, *req.ApplyFrom, req.Rules); rErr != nil {
			return rErr
		}

		oldJSON, oErr := json.Marshal(oldMap)
		if oErr != nil {
			log.Printf("marshal oldMap err: %v", oErr)
		}
		newJSON, nErr := json.Marshal(req.Rules)
		if nErr != nil {
			log.Printf("marshal newRules err: %v", nErr)
		}
		if alErr := s.store.InsertAuditLog(ctx, db.InsertAuditLogParams{
			UserID:      sql.NullInt64{Int64: adminUserID, Valid: true},
			Action:      "RECALCULATE_RETROACTIVE",
			TargetTable: "scoring_rules",
			TargetID:    req.ApplyFrom.Format(time.RFC3339),
			OldValue:    oldJSON,
			NewValue:    newJSON,
			IpAddress:   sql.NullString{},
			UserAgent:   sql.NullString{String: req.Reason, Valid: true},
		}); alErr != nil {
			log.Printf("insert audit log err: %v", alErr)
		}
	}

	return nil
}

func (s *Service) recalculateRetroactive(ctx context.Context, applyFrom time.Time, newMap map[string]int32) error {
	logs, err := s.store.ListScoreLogsSince(ctx, applyFrom)
	if err != nil {
		return fmt.Errorf("failed to list score logs since %v: %w", applyFrom, err)
	}

	for _, logEntry := range logs {
		// Only recalculate entries generated by standard rule keys (exclude previous retro_adjust)
		if logEntry.RuleKey == "retro_adjust" {
			continue
		}

		newPts, hasNew := newMap[logEntry.RuleKey]
		if !hasNew {
			continue
		}

		delta := newPts - logEntry.Points
		if delta == 0 {
			continue
		}

		// Insert delta adjustment entry without mutating old immutable record
		insertErr := s.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
			IssueID:     logEntry.IssueID,
			TargetType:  logEntry.TargetType,
			TargetID:    logEntry.TargetID,
			RuleKey:     "retro_adjust",
			Points:      delta,
			PenaltyDate: logEntry.PenaltyDate,
		})
		if insertErr != nil {
			return fmt.Errorf("failed to insert retro delta for log %d: %w", logEntry.ID, insertErr)
		}
	}

	return nil
}
