package scoring

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/auth"
	"6s/internal/db"
)

type mockHandlerService struct {
	locItems []LocationHealthItem
	repItems []ReporterItem
	rules    []db.ScoringRule
	err      error
}

func (m *mockHandlerService) GetLocationLeaderboard(_ context.Context) ([]LocationHealthItem, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.locItems, nil
}

func (m *mockHandlerService) GetReporterLeaderboard(_ context.Context) ([]ReporterItem, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.repItems, nil
}

func (m *mockHandlerService) GetRules(_ context.Context) ([]db.ScoringRule, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.rules, nil
}

func (m *mockHandlerService) UpdateRules(_ context.Context, _ UpdateRulesRequest, _ int64) error {
	return m.err
}

func TestScoringHandler(t *testing.T) {
	mockSvc := &mockHandlerService{
		locItems: []LocationHealthItem{
			{LocationCode: "LINE_A1", LocationName: "Chuyền May A1", HealthScore: 90, OpenCount: 2, OverdueCount: 0},
		},
		repItems: []ReporterItem{
			{UserID: 1, FullName: "Worker A", Points: 15, ValidCount: 5, SafetyCount: 1},
		},
		rules: []db.ScoringRule{
			{RuleKey: "penalty_normal", Points: -2},
		},
	}
	handler := NewHandler(mockSvc)
	adminUser := db.User{ID: 1, Role: "ADMIN"}

	// 1. GET /api/leaderboard/locations
	reqLoc := httptest.NewRequest("GET", "/api/leaderboard/locations", nil)
	rrLoc := httptest.NewRecorder()
	handler.GetLocationLeaderboard(rrLoc, reqLoc)
	if rrLoc.Code != http.StatusOK {
		t.Fatalf("expected 200 for locations, got %d", rrLoc.Code)
	}

	// 2. GET /api/leaderboard/reporters
	reqRep := httptest.NewRequest("GET", "/api/leaderboard/reporters", nil)
	rrRep := httptest.NewRecorder()
	handler.GetReporterLeaderboard(rrRep, reqRep)
	if rrRep.Code != http.StatusOK {
		t.Fatalf("expected 200 for reporters, got %d", rrRep.Code)
	}

	// 3. GET /api/config/scoring
	reqRules := httptest.NewRequest("GET", "/api/config/scoring", nil)
	rrRules := httptest.NewRecorder()
	handler.GetRules(rrRules, reqRules)
	if rrRules.Code != http.StatusOK {
		t.Fatalf("expected 200 for rules, got %d", rrRules.Code)
	}

	// 4. PUT /api/config/scoring
	body, _ := json.Marshal(UpdateRulesPayload{
		Rules: map[string]int32{"penalty_normal": -3},
	})
	reqPut := httptest.NewRequest("PUT", "/api/config/scoring", bytes.NewReader(body))
	ctxUser := context.WithValue(reqPut.Context(), auth.UserContextKey, adminUser)
	rrPut := httptest.NewRecorder()
	handler.UpdateRules(rrPut, reqPut.WithContext(ctxUser))
	if rrPut.Code != http.StatusOK {
		t.Fatalf("expected 200 for update rules, got %d", rrPut.Code)
	}
}
