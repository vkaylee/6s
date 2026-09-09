package scoring

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"6s/internal/auth"
	"6s/internal/db"
)

type mockHandlerService struct {
	locItems   []LocationHealthItem
	repItems   []ReporterItem
	rules      []db.ScoringRule
	scoreLogs  []ScoreLogItem
	targetLogs []ScoreLogItem
	err        error
}

func (m *mockHandlerService) GetLocationLeaderboard(_ context.Context, locationCode string) ([]LocationHealthItem, error) {
	if m.err != nil {
		return nil, m.err
	}
	if locationCode != "" {
		for _, it := range m.locItems {
			if it.LocationCode == locationCode {
				return []LocationHealthItem{it}, nil
			}
		}
		return []LocationHealthItem{}, nil
	}
	return m.locItems, nil
}

func (m *mockHandlerService) GetReporterLeaderboard(_ context.Context, locationCode string) ([]ReporterItem, error) {
	if m.err != nil {
		return nil, m.err
	}
	if locationCode != "" {
		return []ReporterItem{{UserID: 2, FullName: "Filtered Reporter", Points: 20, ValidCount: 4, SafetyCount: 1}}, nil
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

func (m *mockHandlerService) GetIssueScoreLogs(_ context.Context, _ int64) ([]ScoreLogItem, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.scoreLogs, nil
}

func (m *mockHandlerService) GetTargetScoreLogsInCycle(_ context.Context, _, _ string) ([]ScoreLogItem, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.targetLogs, nil
}

func TestScoringHandler(t *testing.T) {
	mockSvc := &mockHandlerService{
		locItems: []LocationHealthItem{{LocationCode: "LINE_A1", LocationName: "A1"}},
		repItems: []ReporterItem{{UserID: 1, FullName: "Worker A"}},
	}
	handler := NewHandler(mockSvc)

	for _, path := range []string{"/api/leaderboard/locations", "/api/leaderboard/locations?location_code=LINE_A1", "/api/leaderboard/reporters", "/api/leaderboard/reporters?location_code=LINE_A1"} {
		r := httptest.NewRequest("GET", path, nil)
		rr := httptest.NewRecorder()
		if path[:len("/api/leaderboard/locations")] == "/api/leaderboard/locations" {
			handler.GetLocationLeaderboard(rr, r)
		} else {
			handler.GetReporterLeaderboard(rr, r)
		}
		if rr.Code != http.StatusOK {
			t.Errorf("GET %s: expected 200, got %d", path, rr.Code)
		}
	}
}
func TestGetRulesUsesPublicJSONFieldNames(t *testing.T) {
	handler := NewHandler(&mockHandlerService{rules: []db.ScoringRule{{
		RuleKey:     "penalty_normal",
		Points:      -2,
		Description: sql.NullString{String: "Normal issue penalty", Valid: true},
	}}})
	rr := httptest.NewRecorder()
	handler.GetRules(rr, httptest.NewRequest("GET", "/api/config/scoring", nil))

	body := rr.Body.String()
	if !strings.Contains(body, `"rule_key":"penalty_normal"`) || !strings.Contains(body, `"points":-2`) {
		t.Fatalf("scoring rules response lost snake_case fields: %s", body)
	}
	if strings.Contains(body, `"RuleKey"`) {
		t.Fatalf("scoring rules response exposes Go field names: %s", body)
	}
}

func TestScoringHandler_ErrorBranches(t *testing.T) {
	errSvc := &mockHandlerService{err: errors.New("service failure")}
	handler := NewHandler(errSvc)
	adminUser := db.User{ID: 1, Role: "ADMIN"}

	// 1. GetLocationLeaderboard error
	reqLoc := httptest.NewRequest("GET", "/api/leaderboard/locations", nil)
	rrLoc := httptest.NewRecorder()
	handler.GetLocationLeaderboard(rrLoc, reqLoc)
	if rrLoc.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for loc leaderboard error, got %d", rrLoc.Code)
	}

	// 2. GetReporterLeaderboard error
	reqRep := httptest.NewRequest("GET", "/api/leaderboard/reporters", nil)
	rrRep := httptest.NewRecorder()
	handler.GetReporterLeaderboard(rrRep, reqRep)
	if rrRep.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for rep leaderboard error, got %d", rrRep.Code)
	}

	// 3. GetRules error
	reqRules := httptest.NewRequest("GET", "/api/config/scoring", nil)
	rrRules := httptest.NewRecorder()
	handler.GetRules(rrRules, reqRules)
	if rrRules.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for get rules error, got %d", rrRules.Code)
	}

	// 4. GetIssueScoreLogs error
	reqIssue := httptest.NewRequest("GET", "/api/issues/1/score-logs", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "1")
	reqIssue = reqIssue.WithContext(context.WithValue(reqIssue.Context(), chi.RouteCtxKey, rctx))
	rrIssue := httptest.NewRecorder()
	handler.GetIssueScoreLogs(rrIssue, reqIssue)
	if rrIssue.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for issue score logs error, got %d", rrIssue.Code)
	}

	// 5. GetTargetScoreLogs missing target_id
	reqTargetNoID := httptest.NewRequest("GET", "/api/leaderboard/score-logs?target_type=LOCATION", nil)
	rrTargetNoID := httptest.NewRecorder()
	handler.GetTargetScoreLogs(rrTargetNoID, reqTargetNoID)
	if rrTargetNoID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for target missing id, got %d", rrTargetNoID.Code)
	}

	// 6. GetTargetScoreLogs service error
	reqTargetErr := httptest.NewRequest("GET", "/api/leaderboard/score-logs?target_type=LOCATION&target_id=LINE_A1", nil)
	rrTargetErr := httptest.NewRecorder()
	handler.GetTargetScoreLogs(rrTargetErr, reqTargetErr)
	if rrTargetErr.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for target logs error, got %d", rrTargetErr.Code)
	}

	// 7. UpdateRules unauthenticated
	reqUnauth := httptest.NewRequest("PUT", "/api/config/scoring", bytes.NewReader([]byte("{}")))
	rrUnauth := httptest.NewRecorder()
	handler.UpdateRules(rrUnauth, reqUnauth)
	if rrUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth update rules, got %d", rrUnauth.Code)
	}

	// 8. UpdateRules bad JSON
	reqBadJSON := httptest.NewRequest("PUT", "/api/config/scoring", bytes.NewReader([]byte("{invalid")))
	reqBadJSON = reqBadJSON.WithContext(context.WithValue(reqBadJSON.Context(), auth.UserContextKey, adminUser))
	rrBadJSON := httptest.NewRecorder()
	handler.UpdateRules(rrBadJSON, reqBadJSON)
	if rrBadJSON.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json update rules, got %d", rrBadJSON.Code)
	}

	// 9. UpdateRules ErrMissingReason
	errSvc.err = ErrMissingReason
	reqMissingReason := httptest.NewRequest("PUT", "/api/config/scoring", bytes.NewReader([]byte(`{"rules":{"key":1}}`)))
	reqMissingReason = reqMissingReason.WithContext(context.WithValue(reqMissingReason.Context(), auth.UserContextKey, adminUser))
	rrMissingReason := httptest.NewRecorder()
	handler.UpdateRules(rrMissingReason, reqMissingReason)
	if rrMissingReason.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing reason, got %d", rrMissingReason.Code)
	}

	// 10. UpdateRules ErrInvalidRules
	errSvc.err = ErrInvalidRules
	reqInvRules := httptest.NewRequest("PUT", "/api/config/scoring", bytes.NewReader([]byte(`{"rules":{}}`)))
	reqInvRules = reqInvRules.WithContext(context.WithValue(reqInvRules.Context(), auth.UserContextKey, adminUser))
	rrInvRules := httptest.NewRecorder()
	handler.UpdateRules(rrInvRules, reqInvRules)
	if rrInvRules.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid rules, got %d", rrInvRules.Code)
	}
}
