package scoring

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
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

	// 4. GET /api/leaderboard/score-logs
	reqTargetLogs := httptest.NewRequest("GET", "/api/leaderboard/score-logs?target_type=LOCATION&target_id=LINE_A1", nil)
	rrTargetLogs := httptest.NewRecorder()
	handler.GetTargetScoreLogs(rrTargetLogs, reqTargetLogs)
	if rrTargetLogs.Code != http.StatusOK {
		t.Errorf("GetTargetScoreLogs failed with code %d", rrTargetLogs.Code)
	}

	// 5. GET /api/issues/{id}/score-logs
	reqIssueLogs := httptest.NewRequest("GET", "/api/issues/123/score-logs", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "123")
	reqIssueLogs = reqIssueLogs.WithContext(context.WithValue(reqIssueLogs.Context(), chi.RouteCtxKey, rctx))
	rrIssueLogs := httptest.NewRecorder()
	handler.GetIssueScoreLogs(rrIssueLogs, reqIssueLogs)
	if rrIssueLogs.Code != http.StatusOK {
		t.Errorf("GetIssueScoreLogs failed with code %d", rrIssueLogs.Code)
	}

	// Invalid issue id format for issue score logs -> 400 Bad Request
	reqBadIssue := httptest.NewRequest("GET", "/api/issues/abc/score-logs", nil)
	rctxBad := chi.NewRouteContext()
	rctxBad.URLParams.Add("id", "abc")
	reqBadIssue = reqBadIssue.WithContext(context.WithValue(reqBadIssue.Context(), chi.RouteCtxKey, rctxBad))
	rrBadIssue := httptest.NewRecorder()
	handler.GetIssueScoreLogs(rrBadIssue, reqBadIssue)
	if rrBadIssue.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for non-numeric issue id, got %d", rrBadIssue.Code)
	}

	// Invalid target_type -> 400 Bad Request
	reqBadTarget := httptest.NewRequest("GET", "/api/leaderboard/score-logs?target_type=UNKNOWN&target_id=1", nil)
	rrBadTarget := httptest.NewRecorder()
	handler.GetTargetScoreLogs(rrBadTarget, reqBadTarget)
	if rrBadTarget.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid target_type, got %d", rrBadTarget.Code)
	}
	reqPut := httptest.NewRequest("PUT", "/api/config/scoring", bytes.NewReader(body))
	ctxUser := context.WithValue(reqPut.Context(), auth.UserContextKey, adminUser)
	rrPut := httptest.NewRecorder()
	handler.UpdateRules(rrPut, reqPut.WithContext(ctxUser))
	if rrPut.Code != http.StatusOK {
		t.Fatalf("expected 200 for update rules, got %d", rrPut.Code)
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
