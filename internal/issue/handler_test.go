package issue

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
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
	events    chan Event
	eventErrs map[int64]error
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

func (m *mockIssueService) GetIssueByID(_ context.Context, id int64) (*Response, error) {
	if err, ok := m.eventErrs[id]; ok {
		return nil, err
	}
	if m.err != nil {
		return nil, m.err
	}
	return m.issueResp, nil
}
func (m *mockIssueService) OpenMedia(_ context.Context, _ int64, _, _ string) (*os.File, error) {
	if m.err != nil {
		return nil, m.err
	}
	return nil, ErrIssueNotFound
}

func (m *mockIssueService) ListIssuesFiltered(_ context.Context, _, _, _ []string, _ bool, _, _ int) ([]Response, int64, error) {
	if m.err != nil {
		return nil, 0, m.err
	}
	return []Response{*m.issueResp}, 1, nil
}
func (m *mockIssueService) SubscribeEvents() (<-chan Event, func()) {
	if m.events != nil {
		return m.events, func() {}
	}
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
	defer cancel()
	reqEvents := httptest.NewRequest("GET", "/api/issues/events", nil).WithContext(context.WithValue(ctxCancel, auth.UserContextKey, user))
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

func TestIssueHandler_EventsFiltersUnauthorizedIssues(t *testing.T) {
	events := make(chan Event, 2)
	events <- Event{Type: EventIssueUpdated, IssueID: 1}
	events <- Event{Type: EventIssueUpdated, IssueID: 2}
	mockSvc := &mockIssueService{
		issueResp: &Response{ID: 2},
		events:    events,
		eventErrs: map[int64]error{1: ErrIssueNotFound},
	}
	handler := NewHandler(mockSvc)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req := httptest.NewRequest("GET", "/api/issues/events", nil).WithContext(context.WithValue(ctx, auth.UserContextKey, db.User{ID: 7, SiteID: 3, Role: "USER", IsActive: true}))
	rec := httptest.NewRecorder()
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	handler.Events(rec, req)
	body := rec.Body.String()
	if strings.Contains(body, `"issue_id":1`) {
		t.Fatalf("unauthorized issue event leaked: %s", body)
	}
	if !strings.Contains(body, `"issue_id":2`) {
		t.Fatalf("authorized issue event missing: %s", body)
	}
}

func TestIssueHandler_EventsRequiresAuthentication(t *testing.T) {
	handler := NewHandler(&mockIssueService{})
	rec := httptest.NewRecorder()
	handler.Events(rec, httptest.NewRequest("GET", "/api/issues/events", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated SSE, got %d", rec.Code)
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

func TestIssueHandler_AdditionalCoverage(t *testing.T) {
	mockSvc := &mockIssueService{
		issueResp: &Response{ID: 1, Category: "1S"},
	}
	handler := NewHandler(mockSvc)
	user := db.User{ID: 10, Username: "worker", Role: "ADMIN", IsActive: true}

	// 1. Multipart Patch
	r := chi.NewRouter()
	r.Patch("/api/issues/{id}", handler.Patch)

	patchBody := &bytes.Buffer{}
	patchWriter := multipart.NewWriter(patchBody)
	_ = patchWriter.WriteField("category", "2S")
	_ = patchWriter.WriteField("cause_type", "CONDITION")
	_ = patchWriter.WriteField("location_code", "LINE_A1")
	_ = patchWriter.WriteField("description", "Updated desc")
	_ = patchWriter.WriteField("tags", `["tag1","tag2"]`)
	partBefore, _ := patchWriter.CreateFormFile("photo_before", "before.jpg")
	_, _ = partBefore.Write([]byte("fake-jpeg"))
	partDetail, _ := patchWriter.CreateFormFile("photo_detail", "detail.jpg")
	_, _ = partDetail.Write([]byte("fake-detail"))
	_ = patchWriter.Close()

	reqPatchMulti := httptest.NewRequest("PATCH", "/api/issues/1", patchBody)
	reqPatchMulti.Header.Set("Content-Type", patchWriter.FormDataContentType())
	reqPatchMulti = reqPatchMulti.WithContext(context.WithValue(reqPatchMulti.Context(), auth.UserContextKey, user))
	rrPatchMulti := httptest.NewRecorder()
	r.ServeHTTP(rrPatchMulti, reqPatchMulti)
	if rrPatchMulti.Code != http.StatusOK {
		t.Errorf("expected 200 for multipart patch, got %d", rrPatchMulti.Code)
	}

	// 2. Patch Error Branches
	mockSvc.err = ErrPermissionDenied
	reqPatchForbidden := httptest.NewRequest("PATCH", "/api/issues/1", bytes.NewReader([]byte("{}")))
	reqPatchForbidden = reqPatchForbidden.WithContext(context.WithValue(reqPatchForbidden.Context(), auth.UserContextKey, user))
	rrPatchForbidden := httptest.NewRecorder()
	r.ServeHTTP(rrPatchForbidden, reqPatchForbidden)
	if rrPatchForbidden.Code != http.StatusForbidden {
		t.Errorf("expected 403 for patch forbidden, got %d", rrPatchForbidden.Code)
	}

	mockSvc.err = ErrInvalidCategory
	reqPatchInvalidCat := httptest.NewRequest("PATCH", "/api/issues/1", bytes.NewReader([]byte("{}")))
	reqPatchInvalidCat = reqPatchInvalidCat.WithContext(context.WithValue(reqPatchInvalidCat.Context(), auth.UserContextKey, user))
	rrPatchInvalidCat := httptest.NewRecorder()
	r.ServeHTTP(rrPatchInvalidCat, reqPatchInvalidCat)
	if rrPatchInvalidCat.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for patch invalid category, got %d", rrPatchInvalidCat.Code)
	}

	// Patch Unauth & Bad ID
	reqPatchUnauth := httptest.NewRequest("PATCH", "/api/issues/1", bytes.NewReader([]byte("{}")))
	rrPatchUnauth := httptest.NewRecorder()
	r.ServeHTTP(rrPatchUnauth, reqPatchUnauth)
	if rrPatchUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth patch, got %d", rrPatchUnauth.Code)
	}

	reqPatchBadID := httptest.NewRequest("PATCH", "/api/issues/invalid", bytes.NewReader([]byte("{}")))
	reqPatchBadID = reqPatchBadID.WithContext(context.WithValue(reqPatchBadID.Context(), auth.UserContextKey, user))
	rrPatchBadID := httptest.NewRecorder()
	r.ServeHTTP(rrPatchBadID, reqPatchBadID)
	if rrPatchBadID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad id patch, got %d", rrPatchBadID.Code)
	}

	// 3. Close, Reopen, Invalid Error Branches
	r.Post("/api/issues/{id}/close", handler.Close)
	r.Post("/api/issues/{id}/reopen", handler.Reopen)
	r.Post("/api/issues/{id}/invalid", handler.Invalid)

	// Close Unauth, BadID, Forbidden
	reqCloseUnauth := httptest.NewRequest("POST", "/api/issues/1/close", nil)
	rrCloseUnauth := httptest.NewRecorder()
	r.ServeHTTP(rrCloseUnauth, reqCloseUnauth)
	if rrCloseUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth close, got %d", rrCloseUnauth.Code)
	}

	reqCloseBadID := httptest.NewRequest("POST", "/api/issues/abc/close", nil)
	reqCloseBadID = reqCloseBadID.WithContext(context.WithValue(reqCloseBadID.Context(), auth.UserContextKey, user))
	rrCloseBadID := httptest.NewRecorder()
	r.ServeHTTP(rrCloseBadID, reqCloseBadID)
	if rrCloseBadID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad id close, got %d", rrCloseBadID.Code)
	}

	mockSvc.err = ErrPermissionDenied
	reqCloseForbidden := httptest.NewRequest("POST", "/api/issues/1/close", bytes.NewReader([]byte("{}")))
	reqCloseForbidden = reqCloseForbidden.WithContext(context.WithValue(reqCloseForbidden.Context(), auth.UserContextKey, user))
	rrCloseForbidden := httptest.NewRecorder()
	r.ServeHTTP(rrCloseForbidden, reqCloseForbidden)
	if rrCloseForbidden.Code != http.StatusForbidden {
		t.Errorf("expected 403 for close forbidden, got %d", rrCloseForbidden.Code)
	}

	// Reopen Unauth, BadID, Forbidden
	reqReopenUnauth := httptest.NewRequest("POST", "/api/issues/1/reopen", nil)
	rrReopenUnauth := httptest.NewRecorder()
	r.ServeHTTP(rrReopenUnauth, reqReopenUnauth)
	if rrReopenUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth reopen, got %d", rrReopenUnauth.Code)
	}

	reqReopenBadID := httptest.NewRequest("POST", "/api/issues/abc/reopen", nil)
	reqReopenBadID = reqReopenBadID.WithContext(context.WithValue(reqReopenBadID.Context(), auth.UserContextKey, user))
	rrReopenBadID := httptest.NewRecorder()
	r.ServeHTTP(rrReopenBadID, reqReopenBadID)
	if rrReopenBadID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad id reopen, got %d", rrReopenBadID.Code)
	}

	reqReopenForbidden := httptest.NewRequest("POST", "/api/issues/1/reopen", bytes.NewReader([]byte("{}")))
	reqReopenForbidden = reqReopenForbidden.WithContext(context.WithValue(reqReopenForbidden.Context(), auth.UserContextKey, user))
	rrReopenForbidden := httptest.NewRecorder()
	r.ServeHTTP(rrReopenForbidden, reqReopenForbidden)
	if rrReopenForbidden.Code != http.StatusForbidden {
		t.Errorf("expected 403 for reopen forbidden, got %d", rrReopenForbidden.Code)
	}

	// Invalid Unauth, BadID, Forbidden
	reqInvalidUnauth := httptest.NewRequest("POST", "/api/issues/1/invalid", nil)
	rrInvalidUnauth := httptest.NewRecorder()
	r.ServeHTTP(rrInvalidUnauth, reqInvalidUnauth)
	if rrInvalidUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth invalid, got %d", rrInvalidUnauth.Code)
	}

	reqInvalidBadID := httptest.NewRequest("POST", "/api/issues/abc/invalid", nil)
	reqInvalidBadID = reqInvalidBadID.WithContext(context.WithValue(reqInvalidBadID.Context(), auth.UserContextKey, user))
	rrInvalidBadID := httptest.NewRecorder()
	r.ServeHTTP(rrInvalidBadID, reqInvalidBadID)
	if rrInvalidBadID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad id invalid, got %d", rrInvalidBadID.Code)
	}

	reqInvalidForbidden := httptest.NewRequest("POST", "/api/issues/1/invalid", bytes.NewReader([]byte("{}")))
	reqInvalidForbidden = reqInvalidForbidden.WithContext(context.WithValue(reqInvalidForbidden.Context(), auth.UserContextKey, user))
	rrInvalidForbidden := httptest.NewRecorder()
	r.ServeHTTP(rrInvalidForbidden, reqInvalidForbidden)
	if rrInvalidForbidden.Code != http.StatusForbidden {
		t.Errorf("expected 403 for invalid forbidden, got %d", rrInvalidForbidden.Code)
	}

	// Sync Unauth
	reqSyncUnauth := httptest.NewRequest("POST", "/api/issues/sync", nil)
	rrSyncUnauth := httptest.NewRecorder()
	handler.Sync(rrSyncUnauth, reqSyncUnauth)
	if rrSyncUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth sync, got %d", rrSyncUnauth.Code)
	}

	// Resolve Unauth & BadID
	r.Post("/api/issues/{id}/resolve", handler.Resolve)
	reqResolveUnauth := httptest.NewRequest("POST", "/api/issues/1/resolve", nil)
	rrResolveUnauth := httptest.NewRecorder()
	r.ServeHTTP(rrResolveUnauth, reqResolveUnauth)
	if rrResolveUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth resolve, got %d", rrResolveUnauth.Code)
	}

	reqResolveBadID := httptest.NewRequest("POST", "/api/issues/abc/resolve", nil)
	reqResolveBadID = reqResolveBadID.WithContext(context.WithValue(reqResolveBadID.Context(), auth.UserContextKey, user))
	rrResolveBadID := httptest.NewRecorder()
	r.ServeHTTP(rrResolveBadID, reqResolveBadID)
	if rrResolveBadID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad id resolve, got %d", rrResolveBadID.Code)
	}

	// GetByID BadID
	r.Get("/api/issues/{id}", handler.GetByID)
	reqGetBadID := httptest.NewRequest("GET", "/api/issues/abc", nil)
	rrGetBadID := httptest.NewRecorder()
	r.ServeHTTP(rrGetBadID, reqGetBadID)
	if rrGetBadID.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad id get, got %d", rrGetBadID.Code)
	}

	// List with query params
	mockSvc.err = nil
	reqListParams := httptest.NewRequest("GET", "/api/issues?statuses=OPEN,CLOSED&categories=1S,2S&location_codes=LINE_A1&page=2&limit=50", nil)
	rrListParams := httptest.NewRecorder()
	handler.List(rrListParams, reqListParams)
	if rrListParams.Code != http.StatusOK {
		t.Errorf("expected 200 for list with params, got %d", rrListParams.Code)
	}
}
