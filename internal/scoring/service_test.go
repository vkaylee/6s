package scoring

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"6s/internal/db"
	"6s/internal/issue"
)

type mockScoringStore struct {
	locations             []db.Location
	sums                  map[string]int64
	openCount             map[string]int64
	overdue               map[string]int64
	reporters             []db.GetReporterLeaderboardInMonthRow
	locationLeaderboardArg db.GetLocationLeaderboardStatsParams
	reporterLeaderboardArg db.GetReporterLeaderboardInMonthParams
	rules                 map[string]int32
	logs                  []db.ScoreLog
	auditLogs             []db.InsertAuditLogParams
	issueLogs             []db.ListScoreLogsByIssueRow
	targetLogs            []db.ListScoreLogsByTargetSinceRow
}

func (m *mockScoringStore) ListLocations(_ context.Context) ([]db.Location, error) {
	return m.locations, nil
}
func (m *mockScoringStore) GetLocationLeaderboardStats(_ context.Context, arg db.GetLocationLeaderboardStatsParams) ([]db.GetLocationLeaderboardStatsRow, error) {
	m.locationLeaderboardArg = arg
	rows := make([]db.GetLocationLeaderboardStatsRow, 0, len(m.locations))
	for _, loc := range m.locations {
		if arg.LocationCode.Valid && arg.LocationCode.String != loc.Code {
			continue
		}
		rows = append(rows, db.GetLocationLeaderboardStatsRow{LocationCode: loc.Code, LocationName: loc.NameVi, SumPoints: m.sums[loc.Code], OpenCount: m.openCount[loc.Code], OverdueCount: m.overdue[loc.Code]})
	}
	return rows, nil
}

func (m *mockScoringStore) GetReporterLeaderboardInMonth(_ context.Context, arg db.GetReporterLeaderboardInMonthParams) ([]db.GetReporterLeaderboardInMonthRow, error) {
	m.reporterLeaderboardArg = arg
	return m.reporters, nil
}

func (m *mockScoringStore) GetScoringRules(_ context.Context) ([]db.ScoringRule, error) {
	res := make([]db.ScoringRule, 0, len(m.rules))
	for k, v := range m.rules {
		res = append(res, db.ScoringRule{RuleKey: k, Points: v})
	}
	return res, nil
}

func (m *mockScoringStore) GetScoringRuleByKey(_ context.Context, key string) (db.ScoringRule, error) {
	pts, ok := m.rules[key]
	if !ok {
		return db.ScoringRule{}, sql.ErrNoRows
	}
	return db.ScoringRule{RuleKey: key, Points: pts}, nil
}

func (m *mockScoringStore) UpsertScoringRule(_ context.Context, arg db.UpsertScoringRuleParams) (db.ScoringRule, error) {
	m.rules[arg.RuleKey] = arg.Points
	return db.ScoringRule{RuleKey: arg.RuleKey, Points: arg.Points}, nil
}

func (m *mockScoringStore) ListScoreLogsSince(_ context.Context, _ time.Time) ([]db.ScoreLog, error) {
	return m.logs, nil
}

func (m *mockScoringStore) ListScoreLogsByIssue(_ context.Context, _ int64) ([]db.ListScoreLogsByIssueRow, error) {
	return m.issueLogs, nil
}

func (m *mockScoringStore) ListScoreLogsByTargetSince(_ context.Context, _ db.ListScoreLogsByTargetSinceParams) ([]db.ListScoreLogsByTargetSinceRow, error) {
	return m.targetLogs, nil
}

func (m *mockScoringStore) InsertScoreLog(_ context.Context, arg db.InsertScoreLogParams) error {
	m.logs = append(m.logs, db.ScoreLog{
		IssueID:    arg.IssueID,
		TargetType: arg.TargetType,
		TargetID:   arg.TargetID,
		RuleKey:    arg.RuleKey,
		Points:     arg.Points,
	})
	return nil
}

func (m *mockScoringStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	m.auditLogs = append(m.auditLogs, arg)
	return nil
}

func TestScoringService_LocationLeaderboardFormula(t *testing.T) {
	store := &mockScoringStore{
		locations: []db.Location{
			{Code: "LINE_A1", NameVi: "Chuyền May A1"},
			{Code: "LINE_A2", NameVi: "Chuyền May A2"},
		},
		sums: map[string]int64{
			"LINE_A1": -15, // 100 - 15 = 85
			"LINE_A2": 30,  // 100 + 30 = 130 -> capped to 120
		},
		openCount: map[string]int64{
			"LINE_A1": 3,
			"LINE_A2": 0,
		},
		overdue: map[string]int64{
			"LINE_A1": 1,
			"LINE_A2": 0,
		},
		rules: map[string]int32{
			"base_weekly_score": 100,
		},
	}

	svc := NewService(store, time.UTC)
	ctx := context.Background()

	items, err := svc.GetLocationLeaderboard(ctx, "")
	if err != nil {
		t.Fatalf("GetLocationLeaderboard error: %v", err)
	}

	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}

	// Hotspot sorting: lowest score first -> LINE_A1 (85) then LINE_A2 (120)
	if items[0].LocationCode != "LINE_A1" || items[0].HealthScore != 85 {
		t.Errorf("expected first item LINE_A1 with score 85, got %+v", items[0])
	}
	if items[1].LocationCode != "LINE_A2" || items[1].HealthScore != 120 {
		t.Errorf("expected second item LINE_A2 capped at 120, got %+v", items[1])
	}
}

// Filtered location results pass the selected code to the store.
func TestScoringService_LocationLeaderboardFilter(t *testing.T) {
	store := &mockScoringStore{
		locations: []db.Location{{Code: "LINE_A1", NameVi: "A1"}, {Code: "LINE_A2", NameVi: "A2"}},
		sums:      map[string]int64{}, openCount: map[string]int64{}, overdue: map[string]int64{},
		rules: map[string]int32{"base_weekly_score": 100},
	}
	items, err := NewService(store, time.UTC).GetLocationLeaderboard(context.Background(), "LINE_A1")
	if err != nil {
		t.Fatalf("GetLocationLeaderboard error: %v", err)
	}
	if len(items) != 1 || items[0].LocationCode != "LINE_A1" {
		t.Fatalf("expected only LINE_A1, got %+v", items)
	}
	if !store.locationLeaderboardArg.LocationCode.Valid || store.locationLeaderboardArg.LocationCode.String != "LINE_A1" {
		t.Fatalf("expected LINE_A1 filter, got %+v", store.locationLeaderboardArg.LocationCode)
	}
}

func TestScoringService_RetroactiveRecalculate(t *testing.T) {
	store := &mockScoringStore{
		rules: map[string]int32{
			"penalty_safety": -10,
		},
		logs: []db.ScoreLog{
			{ID: 1, IssueID: 10, TargetType: "LOCATION", TargetID: "LINE_A1", RuleKey: "penalty_safety", Points: -10},
		},
	}

	svc := NewService(store, time.UTC)
	ctx := context.Background()
	applyFrom := time.Now().Add(-24 * time.Hour)

	// Admin increases penalty_safety to -20
	err := svc.UpdateRules(ctx, UpdateRulesRequest{
		Rules: map[string]int32{
			"penalty_safety": -20,
		},
		ApplyFrom: &applyFrom,
		Reason:    "Ban Giam Doc chi dao",
	}, 1)

	if err != nil {
		t.Fatalf("UpdateRules error: %v", err)
	}

	// Check delta inserted: new (-20) - old (-10) = -10
	foundDelta := false
	for _, l := range store.logs {
		if l.RuleKey == "retro_adjust" && l.Points == -10 {
			foundDelta = true
			break
		}
	}
	if !foundDelta {
		t.Errorf("expected retro_adjust entry with delta -10 in logs, got %+v", store.logs)
	}

	if len(store.auditLogs) != 1 {
		t.Errorf("expected 1 audit log entry, got %d", len(store.auditLogs))
	}
}

func TestScoringService_ReporterLeaderboardAndRules(t *testing.T) {
	store := &mockScoringStore{
		reporters: []db.GetReporterLeaderboardInMonthRow{
			{
				UserID:      10,
				FullName:    "Super Hunter",
				Points:      50,
				ValidCount:  10,
				SafetyCount: 3,
			},
		},
		rules: map[string]int32{
			"reward_valid": 5,
		},
	}

	svc := NewService(store, time.UTC)
	ctx := context.Background()

	// 1. Reporter leaderboard (no filter)
	items, err := svc.GetReporterLeaderboard(ctx, "")
	if err != nil {
		t.Fatalf("GetReporterLeaderboard error: %v", err)
	}
	if len(items) != 1 || items[0].UserID != 10 {
		t.Errorf("expected 1 reporter with ID 10, got %+v", items)
	}
	if store.reporterLeaderboardArg.LocationCode.Valid {
		t.Errorf("expected empty reporter filter to be invalid, got %+v", store.reporterLeaderboardArg.LocationCode)
	}

	// 2. Filtered reporter leaderboard
	filtered, err := svc.GetReporterLeaderboard(ctx, "LINE_A1")
	if err != nil {
		t.Fatalf("GetReporterLeaderboard filtered error: %v", err)
	}
	if len(filtered) != 1 || filtered[0].UserID != 10 {
		t.Errorf("expected 1 filtered reporter with ID 10, got %+v", filtered)
	}
	if !store.reporterLeaderboardArg.LocationCode.Valid || store.reporterLeaderboardArg.LocationCode.String != "LINE_A1" {
		t.Errorf("expected reporter filter LINE_A1, got %+v", store.reporterLeaderboardArg.LocationCode)
	}

	// 3. Get rules
	rules, err := svc.GetRules(ctx)
	if err != nil {
		t.Fatalf("GetRules error: %v", err)
	}
	if len(rules) != 1 || rules[0].RuleKey != "reward_valid" {
		t.Errorf("expected reward_valid rule, got %+v", rules)
	}

	// 4. StartOfMonth verification
	now := time.Date(2026, 9, 15, 12, 0, 0, 0, time.UTC)
	start := StartOfMonth(now, time.UTC)
	if start.Day() != 1 || start.Month() != 9 || start.Year() != 2026 {
		t.Errorf("expected 2026-09-01 00:00:00, got %v", start)
	}
}

func TestScoringService_ScoreLogs(t *testing.T) {
	store := &mockScoringStore{
		issueLogs: []db.ListScoreLogsByIssueRow{
			{
				ID:              1,
				IssueID:         100,
				TargetType:      "LOCATION",
				TargetID:        "LINE_A1",
				RuleKey:         "penalty_normal",
				RuleDescription: "Normal penalty",
				Points:          -2,
				CreatedAt:       time.Now(),
			},
	},
	targetLogs: []db.ListScoreLogsByTargetSinceRow{
			{
				ID:               2,
				IssueID:          100,
				TargetType:       "LOCATION",
				TargetID:         "LINE_A1",
				RuleKey:          "penalty_normal",
				RuleDescription:  "Normal penalty",
				Points:           -2,
				CreatedAt:        time.Now(),
				IssueCategory:    "1S",
				IssueDescription: "Dust on machine",
			},
		},
	}
	svc := NewService(store, nil)
	ctx := context.Background()

	issueLogs, err := svc.GetIssueScoreLogs(ctx, 100)
	if err != nil {
		t.Fatalf("unexpected error GetIssueScoreLogs: %v", err)
	}
	if len(issueLogs) != 1 || issueLogs[0].Points != -2 {
		t.Fatalf("expected 1 issue score log with -2 pts, got %+v", issueLogs)
	}

	targetLogs, err := svc.GetTargetScoreLogsInCycle(ctx, "LOCATION", "LINE_A1")
	if err != nil {
		t.Fatalf("unexpected error GetTargetScoreLogsInCycle: %v", err)
	}
	if len(targetLogs) != 1 || targetLogs[0].IssueCategory != issue.Category1S.String() {
		t.Fatalf("expected 1 target score log with category 1S, got %+v", targetLogs)
	}
}

func TestScoringService_UpdateRulesRetroactive(t *testing.T) {
	now := time.Now()
	applyFrom := now.Add(-24 * time.Hour)
	store := &mockScoringStore{
		rules: map[string]int32{
			"penalty_normal": -2,
		},
		logs: []db.ScoreLog{
			{
				IssueID:    1,
				TargetType: "LOCATION",
				TargetID:   "LINE_A1",
				RuleKey:    "penalty_normal",
				Points:     -2,
			},
			{
				IssueID:    2,
				TargetType: "LOCATION",
				TargetID:   "LINE_A1",
				RuleKey:    "retro_adjust",
				Points:     -1,
			},
		},
	}
	svc := NewService(store, time.UTC)
	ctx := context.Background()

	// Missing reason error
	errNoReason := svc.UpdateRules(ctx, UpdateRulesRequest{
		Rules:     map[string]int32{"penalty_normal": -5},
		ApplyFrom: &applyFrom,
		Reason:    "",
	}, 1)
	if errNoReason != ErrMissingReason {
		t.Errorf("expected ErrMissingReason, got %v", errNoReason)
	}

	// Empty rules error
	errEmpty := svc.UpdateRules(ctx, UpdateRulesRequest{Rules: nil}, 1)
	if errEmpty != ErrInvalidRules {
		t.Errorf("expected ErrInvalidRules, got %v", errEmpty)
	}

	// Successful retroactive recalculation
	err := svc.UpdateRules(ctx, UpdateRulesRequest{
		Rules:     map[string]int32{"penalty_normal": -5},
		ApplyFrom: &applyFrom,
		Reason:    "Policy change",
	}, 1)
	if err != nil {
		t.Fatalf("unexpected error on UpdateRules with ApplyFrom: %v", err)
	}

	// Verify retro_adjust log was created with delta = -5 - (-2) = -3
	var foundRetro bool
	for _, l := range store.logs {
		if l.RuleKey == "retro_adjust" && l.Points == -3 {
			foundRetro = true
			break
		}
	}
	if !foundRetro {
		t.Errorf("expected retro_adjust log with -3 points, logs: %+v", store.logs)
	}
}
