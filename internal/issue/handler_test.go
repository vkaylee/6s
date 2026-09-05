package issue

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
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

func TestIssueHandler_Routes(t *testing.T) {
	mockSvc := &mockIssueService{
		issueResp: &Response{
			ID:           1,
			ClientUUID:   "c0a80101-0000-4000-8000-000000000001",
			Version:      1,
			Category:     "1S",
			LocationCode: "LINE_A1",
			Status:       "OPEN",
			Creator:      UserItem{ID: 10, Username: "worker", FullName: "Worker"},
		},
	}
	handler := NewHandler(mockSvc)
	user := db.User{ID: 10, Username: "worker", Role: "ADMIN", IsActive: true}

	r := chi.NewRouter()
	r.Post("/api/issues/sync", handler.Sync)
	r.Post("/api/issues/{id}/resolve", handler.Resolve)
	r.Post("/api/issues/{id}/reopen", handler.Reopen)
	r.Post("/api/issues/{id}/invalid", handler.Invalid)
	r.Patch("/api/issues/{id}", handler.Patch)

	// 1. Reopen
	reopenBody, _ := json.Marshal(ReopenRequest{RejectReason: "Chua sach"})
	reqReopen := httptest.NewRequest("POST", "/api/issues/1/reopen", bytes.NewReader(reopenBody))
	reqReopen = reqReopen.WithContext(context.WithValue(reqReopen.Context(), auth.UserContextKey, user))
	rrReopen := httptest.NewRecorder()
	r.ServeHTTP(rrReopen, reqReopen)
	if rrReopen.Code != http.StatusOK {
		t.Errorf("expected 200 for reopen, got %d", rrReopen.Code)
	}

	// 2. Invalid
	invalidBody, _ := json.Marshal(InvalidRequest{Reason: "Khong phai loi"})
	reqInvalid := httptest.NewRequest("POST", "/api/issues/1/invalid", bytes.NewReader(invalidBody))
	reqInvalid = reqInvalid.WithContext(context.WithValue(reqInvalid.Context(), auth.UserContextKey, user))
	rrInvalid := httptest.NewRecorder()
	r.ServeHTTP(rrInvalid, reqInvalid)
	if rrInvalid.Code != http.StatusOK {
		t.Errorf("expected 200 for invalid, got %d", rrInvalid.Code)
	}

	// 3. Patch
	cat := "2S"
	patchBody, _ := json.Marshal(PatchRequest{Category: &cat, Tags: []string{"tag1"}})
	reqPatch := httptest.NewRequest("PATCH", "/api/issues/1", bytes.NewReader(patchBody))
	reqPatch = reqPatch.WithContext(context.WithValue(reqPatch.Context(), auth.UserContextKey, user))
	rrPatch := httptest.NewRecorder()
	r.ServeHTTP(rrPatch, reqPatch)
	if rrPatch.Code != http.StatusOK {
		t.Errorf("expected 200 for patch, got %d", rrPatch.Code)
	}

	// 4. Sync
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("client_uuid", "c0a80101-0000-4000-8000-000000000001")
	_ = writer.WriteField("category", "1S")
	_ = writer.WriteField("location_code", "LINE_A1")
	part, _ := writer.CreateFormFile("photo_before", "before.jpg")
	_, _ = part.Write([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9})
	_ = writer.Close()

	reqSync := httptest.NewRequest("POST", "/api/issues/sync", body)
	reqSync.Header.Set("Content-Type", writer.FormDataContentType())
	reqSync = reqSync.WithContext(context.WithValue(reqSync.Context(), auth.UserContextKey, user))
	rrSync := httptest.NewRecorder()
	r.ServeHTTP(rrSync, reqSync)
	if rrSync.Code != http.StatusCreated && rrSync.Code != http.StatusOK {
		t.Errorf("expected 200/201 for sync, got %d", rrSync.Code)
	}

	// 5. Resolve
	resBody := &bytes.Buffer{}
	resWriter := multipart.NewWriter(resBody)
	_ = resWriter.WriteField("resolved_client_uuid", "c0a80101-0000-4000-8000-000000000002")
	resPart, _ := resWriter.CreateFormFile("photo_after", "after.jpg")
	_, _ = resPart.Write([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9})
	_ = resWriter.Close()

	reqRes := httptest.NewRequest("POST", "/api/issues/1/resolve", resBody)
	reqRes.Header.Set("Content-Type", resWriter.FormDataContentType())
	reqRes = reqRes.WithContext(context.WithValue(reqRes.Context(), auth.UserContextKey, user))
	rrRes := httptest.NewRecorder()
	r.ServeHTTP(rrRes, reqRes)
	if rrRes.Code != http.StatusOK {
		t.Errorf("expected 200 for resolve, got %d", rrRes.Code)
	}
}

func TestIssueHandler_ErrorPaths(t *testing.T) {
	mockSvc := &mockIssueService{
		err: ErrIssueConflict,
	}
	handler := NewHandler(mockSvc)
	user := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}

	r := chi.NewRouter()
	r.Post("/api/issues/{id}/close", handler.Close)
	r.Post("/api/issues/{id}/reopen", handler.Reopen)
	r.Post("/api/issues/{id}/invalid", handler.Invalid)

	// Close Conflict
	reqClose := httptest.NewRequest("POST", "/api/issues/1/close", bytes.NewReader([]byte("{}")))
	reqClose = reqClose.WithContext(context.WithValue(reqClose.Context(), auth.UserContextKey, user))
	rrClose := httptest.NewRecorder()
	r.ServeHTTP(rrClose, reqClose)
	if rrClose.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict, got %d", rrClose.Code)
	}

	// Reopen Conflict
	reqReopen := httptest.NewRequest("POST", "/api/issues/1/reopen", bytes.NewReader([]byte("{}")))
	reqReopen = reqReopen.WithContext(context.WithValue(reqReopen.Context(), auth.UserContextKey, user))
	rrReopen := httptest.NewRecorder()
	r.ServeHTTP(rrReopen, reqReopen)
	if rrReopen.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict, got %d", rrReopen.Code)
	}

	// Invalid Conflict
	reqInvalid := httptest.NewRequest("POST", "/api/issues/1/invalid", bytes.NewReader([]byte("{}")))
	reqInvalid = reqInvalid.WithContext(context.WithValue(reqInvalid.Context(), auth.UserContextKey, user))
	rrInvalid := httptest.NewRecorder()
	r.ServeHTTP(rrInvalid, reqInvalid)
	if rrInvalid.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict, got %d", rrInvalid.Code)
	}

	// Invalid ID syntax
	reqBadID := httptest.NewRequest("POST", "/api/issues/abc/close", bytes.NewReader([]byte("{}")))
	reqBadID = reqBadID.WithContext(context.WithValue(reqBadID.Context(), auth.UserContextKey, user))
	rrBadID := httptest.NewRecorder()
	r.ServeHTTP(rrBadID, reqBadID)
	if rrBadID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for invalid id, got %d", rrBadID.Code)
	}

	// Resolve Conflict
	r.Post("/api/issues/{id}/resolve", handler.Resolve)
	resBody := &bytes.Buffer{}
	resWriter := multipart.NewWriter(resBody)
	_ = resWriter.WriteField("resolved_client_uuid", "c0a80101-0000-4000-8000-000000000002")
	resPart, _ := resWriter.CreateFormFile("photo_after", "after.jpg")
	_, _ = resPart.Write([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9})
	_ = resWriter.Close()
	reqResConflict := httptest.NewRequest("POST", "/api/issues/1/resolve", resBody)
	reqResConflict.Header.Set("Content-Type", resWriter.FormDataContentType())
	reqResConflict = reqResConflict.WithContext(context.WithValue(reqResConflict.Context(), auth.UserContextKey, user))
	rrResConflict := httptest.NewRecorder()
	r.ServeHTTP(rrResConflict, reqResConflict)
	if rrResConflict.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict for resolve, got %d", rrResConflict.Code)
	}

	// Patch NotFound
	r.Patch("/api/issues/{id}", handler.Patch)
	mockSvc.err = ErrIssueNotFound
	reqPatchNF := httptest.NewRequest("PATCH", "/api/issues/1", bytes.NewReader([]byte("{}")))
	reqPatchNF = reqPatchNF.WithContext(context.WithValue(reqPatchNF.Context(), auth.UserContextKey, user))
	rrPatchNF := httptest.NewRecorder()
	r.ServeHTTP(rrPatchNF, reqPatchNF)
	if rrPatchNF.Code != http.StatusNotFound {
		t.Errorf("expected 404 NotFound for patch, got %d", rrPatchNF.Code)
	}

	// GetByID NotFound
	r.Get("/api/issues/{id}", handler.GetByID)
	reqGetNF := httptest.NewRequest("GET", "/api/issues/1", nil)
	rrGetNF := httptest.NewRecorder()
	r.ServeHTTP(rrGetNF, reqGetNF)
	if rrGetNF.Code != http.StatusNotFound {
		t.Errorf("expected 404 NotFound for get by id, got %d", rrGetNF.Code)
	}

	// Sync Missing Fields
	r.Post("/api/issues/sync", handler.Sync)
	bodyEmpty := &bytes.Buffer{}
	wEmpty := multipart.NewWriter(bodyEmpty)
	_ = wEmpty.Close()
	reqSyncMissing := httptest.NewRequest("POST", "/api/issues/sync", bodyEmpty)
	reqSyncMissing.Header.Set("Content-Type", wEmpty.FormDataContentType())
	reqSyncMissing = reqSyncMissing.WithContext(context.WithValue(reqSyncMissing.Context(), auth.UserContextKey, user))
	rrSyncMissing := httptest.NewRecorder()
	r.ServeHTTP(rrSyncMissing, reqSyncMissing)
	if rrSyncMissing.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for sync missing fields, got %d", rrSyncMissing.Code)
	}

	// Resolve Missing photo_after
	resBodyNoPhoto := &bytes.Buffer{}
	resWNoPhoto := multipart.NewWriter(resBodyNoPhoto)
	_ = resWNoPhoto.WriteField("resolved_client_uuid", "c0a80101-0000-4000-8000-000000000002")
	_ = resWNoPhoto.Close()
	reqResNoPhoto := httptest.NewRequest("POST", "/api/issues/1/resolve", resBodyNoPhoto)
	reqResNoPhoto.Header.Set("Content-Type", resWNoPhoto.FormDataContentType())
	reqResNoPhoto = reqResNoPhoto.WithContext(context.WithValue(reqResNoPhoto.Context(), auth.UserContextKey, user))
	rrResNoPhoto := httptest.NewRecorder()
	r.ServeHTTP(rrResNoPhoto, reqResNoPhoto)
	if rrResNoPhoto.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for resolve missing photo, got %d", rrResNoPhoto.Code)
	}
}
