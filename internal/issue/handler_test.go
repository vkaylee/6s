package issue

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"6s/internal/auth"
	"6s/internal/db"
)

type mockIssueService struct {
	issueResp *Response
	err       error
}

func (m *mockIssueService) SyncIssue(_ context.Context, _ SyncIssueRequest, _ db.User) (*Response, bool, error) {
	if m.err != nil {
		return nil, false, m.err
	}
	return m.issueResp, true, nil
}

func (m *mockIssueService) ResolveIssue(_ context.Context, _ ResolveIssueRequest, _ db.User) (*Response, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.issueResp, nil
}

func (m *mockIssueService) CloseIssue(_ context.Context, _ CloseIssueRequest, _ db.User) (*Response, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.issueResp, nil
}

func (m *mockIssueService) ReopenIssue(_ context.Context, _ ReopenIssueRequest, _ db.User) (*Response, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.issueResp, nil
}

func (m *mockIssueService) InvalidateIssue(_ context.Context, _ InvalidateIssueRequest, _ db.User) (*Response, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.issueResp, nil
}

func (m *mockIssueService) PatchIssue(_ context.Context, _ PatchIssueRequest, _ db.User) (*Response, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.issueResp, nil
}

func (m *mockIssueService) GetIssueByID(_ context.Context, _ int64) (*Response, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.issueResp, nil
}

func (m *mockIssueService) ListIssuesFiltered(_ context.Context, _, _, _ string, _, _ int) ([]Response, int64, error) {
	if m.err != nil {
		return nil, 0, m.err
	}
	return []Response{*m.issueResp}, 1, nil
}
func (m *mockIssueService) SubscribeEvents() (<-chan Event, func()) {
	ch := make(chan Event, 1)
	return ch, func() {}
}

func TestIssueHandler(t *testing.T) {
	mockSvc := &mockIssueService{
		issueResp: &Response{
			ID:           1,
			ClientUUID:   "c0a80101-0000-4000-8000-000000000001",
			Version:      1,
			Category:     "3S",
			LocationCode: "LINE_A1",
			LocationName: "Chuyền May A1",
			Status:       "OPEN",
			Creator: UserItem{
				ID:       10,
				Username: "worker",
				FullName: "Worker",
			},
			CreatedAt: "2026-09-04T08:00:00Z",
		},
	}
	handler := NewHandler(mockSvc)
	user := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}

	// 1. List
	reqList := httptest.NewRequest("GET", "/api/issues?page=1&limit=20", nil)
	rrList := httptest.NewRecorder()
	handler.List(rrList, reqList)
	if rrList.Code != http.StatusOK {
		t.Fatalf("expected 200 for list, got %d", rrList.Code)
	}

	// 2. GetByID
	r := chi.NewRouter()
	r.Get("/api/issues/{id}", handler.GetByID)
	reqGet := httptest.NewRequest("GET", "/api/issues/1", nil)
	rrGet := httptest.NewRecorder()
	r.ServeHTTP(rrGet, reqGet)
	if rrGet.Code != http.StatusOK {
		t.Fatalf("expected 200 for get by id, got %d", rrGet.Code)
	}

	// 3. Close
	closeBody, _ := json.Marshal(CloseRequest{ScoreRating: 5})
	reqClose := httptest.NewRequest("POST", "/api/issues/1/close", bytes.NewReader(closeBody))
	ctxUser := context.WithValue(reqClose.Context(), auth.UserContextKey, user)
	rClose := chi.NewRouter()
	rClose.Post("/api/issues/{id}/close", handler.Close)
	rrClose := httptest.NewRecorder()
	rClose.ServeHTTP(rrClose, reqClose.WithContext(ctxUser))
	if rrClose.Code != http.StatusOK {
		t.Fatalf("expected 200 for close, got %d", rrClose.Code)
	}

	// 4. Events SSE stream
	ctxCancel, cancel := context.WithCancel(context.Background())
	reqEvents := httptest.NewRequest("GET", "/api/issues/events", nil).WithContext(ctxCancel)
	rrEvents := httptest.NewRecorder()

	// Cancel context after brief moment to terminate SSE loop
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	handler.Events(rrEvents, reqEvents)
	if rrEvents.Code != http.StatusOK {
		t.Fatalf("expected 200 for events, got %d", rrEvents.Code)
	}
	if ct := rrEvents.Header().Get("Content-Type"); !strings.Contains(ct, "text/event-stream") {
		t.Errorf("expected text/event-stream content-type, got %s", ct)
	}
}
