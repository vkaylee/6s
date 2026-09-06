package issue

import (
	"bytes"
	"context"
	"database/sql"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"6s/internal/ai"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/storage"
)

type mockIssueStore struct {
	issues       map[int64]db.Issue
	locations    map[string]db.Location
	tags         map[int64][]string
	users        map[int64]db.User
	outbox       []db.CreateOutboxEntryParams
	scoreLogs    []db.InsertScoreLogParams
	auditLogs    []db.InsertAuditLogParams
	translations map[string]string
}

func newMockIssueStore() *mockIssueStore {
	return &mockIssueStore{
		issues:       make(map[int64]db.Issue),
		locations:    make(map[string]db.Location),
		tags:         make(map[int64][]string),
		users:        make(map[int64]db.User),
		translations: make(map[string]string),
	}
}

func (m *mockIssueStore) GetIssueByID(_ context.Context, id int64) (db.Issue, error) {
	iss, ok := m.issues[id]
	if !ok {
		return db.Issue{}, sql.ErrNoRows
	}
	return iss, nil
}

func (m *mockIssueStore) GetIssueByUUID(_ context.Context, clientUUID string) (db.Issue, error) {
	for _, iss := range m.issues {
		if iss.ClientUuid == clientUUID {
			return iss, nil
		}
	}
	return db.Issue{}, sql.ErrNoRows
}

func (m *mockIssueStore) CreateIssue(_ context.Context, arg db.CreateIssueParams) (db.Issue, error) {
	iss := db.Issue{
		ID:           int64(len(m.issues) + 1),
		ClientUuid:   arg.ClientUuid,
		Version:      1,
		CreatorID:    arg.CreatorID,
		Category:     arg.Category,
		CauseType:    arg.CauseType,
		LocationCode: arg.LocationCode,
		Description:  arg.Description,
		PhotoBefore:  arg.PhotoBefore,
		PhotoDetail:  arg.PhotoDetail,
		Status:       StatusOpen.String(),
		CreatedAt:    time.Now(),
	}
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) InsertIssueTag(_ context.Context, arg db.InsertIssueTagParams) error {
	m.tags[arg.IssueID] = append(m.tags[arg.IssueID], arg.TagCode)
	return nil
}

func (m *mockIssueStore) ListTagsForIssue(_ context.Context, issueID int64) ([]db.ListTagsForIssueRow, error) {
	tags := m.tags[issueID]
	rows := make([]db.ListTagsForIssueRow, 0, len(tags))
	for _, t := range tags {
		rows = append(rows, db.ListTagsForIssueRow{Code: t, NameVi: t})
	}
	return rows, nil
}

func (m *mockIssueStore) DeleteIssueTags(_ context.Context, issueID int64) error {
	delete(m.tags, issueID)
	return nil
}

func (m *mockIssueStore) IncrementTagUseCount(_ context.Context, _ string) error {
	return nil
}

func (m *mockIssueStore) ListIssuesFiltered(_ context.Context, _ db.ListIssuesFilteredParams) ([]db.ListIssuesFilteredRow, error) {
	rows := make([]db.ListIssuesFilteredRow, 0, len(m.issues))
	for _, iss := range m.issues {
		u := m.users[iss.CreatorID]
		loc := m.locations[iss.LocationCode]
		rows = append(rows, db.ListIssuesFilteredRow{
			ID:              iss.ID,
			ClientUuid:      iss.ClientUuid,
			Version:         iss.Version,
			CreatorID:       iss.CreatorID,
			Category:        iss.Category,
			LocationCode:    iss.LocationCode,
			Description:     iss.Description,
			PhotoBefore:     iss.PhotoBefore,
			Status:          iss.Status,
			LocationNameVi:  loc.NameVi,
			CreatorUsername: u.Username,
			CreatorFullName: u.FullName,
			CreatedAt:       iss.CreatedAt,
		})
	}
	return rows, nil
}

func (m *mockIssueStore) CountIssuesFiltered(_ context.Context, _ db.CountIssuesFilteredParams) (int64, error) {
	return int64(len(m.issues)), nil
}

func (m *mockIssueStore) ResolveIssue(_ context.Context, arg db.ResolveIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || iss.Status != StatusOpen.String() || iss.Version != arg.Version {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusPendingReview.String()
	iss.ResolverID = arg.ResolverID
	iss.PhotoAfter = arg.PhotoAfter
	iss.Version++
	now := time.Now()
	iss.ResolvedAt = sql.NullTime{Time: now, Valid: true}
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) ForceResolveIssue(_ context.Context, arg db.ForceResolveIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusPendingReview.String()
	iss.ResolverID = arg.ResolverID
	iss.PhotoAfter = arg.PhotoAfter
	iss.Version++
	now := time.Now()
	iss.ResolvedAt = sql.NullTime{Time: now, Valid: true}
	m.issues[iss.ID] = iss
	return iss, nil
}
func (m *mockIssueStore) GetTranslationCacheBatch(_ context.Context, arg db.GetTranslationCacheBatchParams) ([]db.GetTranslationCacheBatchRow, error) {
	if m.translations == nil {
		return nil, nil
	}
	var res []db.GetTranslationCacheBatchRow
	for _, h := range arg.ContentHashes {
		if text, ok := m.translations[h+":"+arg.TargetLang]; ok {
			res = append(res, db.GetTranslationCacheBatchRow{
				ContentHash:    h,
				TranslatedText: text,
			})
		}
	}
	return res, nil
}

func (m *mockIssueStore) CloseIssue(_ context.Context, arg db.CloseIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || iss.Status != StatusPendingReview.String() {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.ExpectedVersion.Valid && iss.Version != arg.ExpectedVersion.Int32 {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusClosed.String()
	iss.ScoreRating = arg.ScoreRating
	iss.Version++
	now := time.Now()
	iss.ClosedAt = sql.NullTime{Time: now, Valid: true}
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) ReopenIssue(_ context.Context, arg db.ReopenIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || iss.Status != StatusPendingReview.String() {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.ExpectedVersion.Valid && iss.Version != arg.ExpectedVersion.Int32 {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusOpen.String()
	iss.RejectReason = arg.RejectReason
	iss.Version++
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) InvalidateIssue(_ context.Context, arg db.InvalidateIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok || (iss.Status != StatusOpen.String() && iss.Status != StatusPendingReview.String()) {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.ExpectedVersion.Valid && iss.Version != arg.ExpectedVersion.Int32 {
		return db.Issue{}, sql.ErrNoRows
	}
	iss.Status = StatusInvalid.String()
	iss.RejectReason = arg.RejectReason
	iss.Version++
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) PatchIssue(_ context.Context, arg db.PatchIssueParams) (db.Issue, error) {
	iss, ok := m.issues[arg.ID]
	if !ok {
		return db.Issue{}, sql.ErrNoRows
	}
	if arg.Category.Valid {
		iss.Category = arg.Category.String
	}
	if arg.CauseType.Valid {
		iss.CauseType = arg.CauseType.String
	}
	if arg.LocationCode.Valid {
		iss.LocationCode = arg.LocationCode.String
	}
	if arg.Description.Valid {
		iss.Description = arg.Description
	}
	if arg.PhotoBefore.Valid {
		iss.PhotoBefore = arg.PhotoBefore.String
	}
	if arg.PhotoDetail.Valid {
		iss.PhotoDetail = arg.PhotoDetail
	}
	iss.Version++
	m.issues[iss.ID] = iss
	return iss, nil
}

func (m *mockIssueStore) CreateOutboxEntry(_ context.Context, arg db.CreateOutboxEntryParams) (db.NotificationOutbox, error) {
	m.outbox = append(m.outbox, arg)
	return db.NotificationOutbox{}, nil
}

func (m *mockIssueStore) InsertScoreLog(_ context.Context, arg db.InsertScoreLogParams) error {
	m.scoreLogs = append(m.scoreLogs, arg)
	return nil
}

func (m *mockIssueStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	m.auditLogs = append(m.auditLogs, arg)
	return nil
}

func (m *mockIssueStore) GetLocationByCode(_ context.Context, code string) (db.Location, error) {
	loc, ok := m.locations[code]
	if !ok {
		return db.Location{}, sql.ErrNoRows
	}
	return loc, nil
}

func (m *mockIssueStore) GetUserByID(_ context.Context, id int64) (db.User, error) {
	u, ok := m.users[id]
	if !ok {
		return db.User{}, sql.ErrNoRows
	}
	return u, nil
}

func createTestFileHeader(t *testing.T, fieldName, filename string, content []byte) *multipart.FileHeader {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("CreateFormFile error: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("Write part error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close writer error: %v", err)
	}

	req := httptest.NewRequest("POST", "/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err := req.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		t.Fatalf("ParseMultipartForm error: %v", err)
	}

	return req.MultipartForm.File[fieldName][0]
}

func TestIssueService_FullWorkflow(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "6s_test_issue_svc_*")
	defer func() { _ = os.RemoveAll(tempDir) }()

	storageMgr, _ := storage.NewManager(tempDir)
	store := newMockIssueStore()
	notifyCh := make(chan struct{}, 10)
	svc := NewService(store, storageMgr, notifyCh)

	eventsCh, unsub := svc.SubscribeEvents()
	defer unsub()

	// Setup mock data
	worker := db.User{ID: 10, Username: "worker", FullName: "Worker", Role: "USER", IsActive: true}
	admin := db.User{ID: 1, Username: "admin", FullName: "Admin", Role: "ADMIN", IsActive: true}
	store.users[worker.ID] = worker
	store.users[admin.ID] = admin
	store.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}

	// 1. Sync new issue
	jpegBytes := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0x01}, 100)...)
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)

	clientUUID := "c0a80101-0000-4000-8000-000000000001"
	resp, created, err := svc.SyncIssue(context.Background(), SyncIssueRequest{
		ClientUUID:   clientUUID,
		Category:     "3S",
		LocationCode: "LINE_A1",
		Tags:         []string{"oil_leak"},
		Description:  "Dầu rỉ",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("SyncIssue error: %v", err)
	}
	if !created {
		t.Fatal("expected created=true")
	}
	if resp.Status != StatusOpen.String() {
		t.Errorf("expected status OPEN, got %s", resp.Status)
	}
	// Verify ISSUE_CREATED event received
	select {
	case evt := <-eventsCh:
		if evt.Type != EventIssueCreated || evt.IssueID != resp.ID {
			t.Errorf("unexpected event received: %+v", evt)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timeout waiting for ISSUE_CREATED event")
	}

	expectedBeforeURL := "/uploads/before/" + clientUUID + "_wide.jpg"
	if resp.PhotoBefore != expectedBeforeURL {
		t.Errorf("expected photo_before %s, got %s", expectedBeforeURL, resp.PhotoBefore)
	}
	// 2. Resolve issue
	fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpegBytes)
	resolveUUID := "c0a80101-0000-4000-8000-000000000002"
	resResp, err := svc.ResolveIssue(context.Background(), ResolveIssueRequest{
		IssueID:            resp.ID,
		ResolvedClientUUID: resolveUUID,
		ExpectedVersion:    resp.Version,
		PhotoAfter:         fhAfter,
	}, worker)
	if err != nil {
		t.Fatalf("ResolveIssue error: %v", err)
	}
	if resResp.Status != StatusPendingReview.String() {
		t.Errorf("expected status PENDING_REVIEW, got %s", resResp.Status)
	}
	expectedAfterURL := "/uploads/after/" + resolveUUID + ".jpg"
	if resResp.PhotoAfter == nil || *resResp.PhotoAfter != expectedAfterURL {
		t.Errorf("expected photo_after %s, got %v", expectedAfterURL, resResp.PhotoAfter)
	}
	// 3. Close issue by Admin (score rating 5)
	expVer := resResp.Version
	closedResp, err := svc.CloseIssue(context.Background(), CloseIssueRequest{
		IssueID:         resResp.ID,
		ScoreRating:     5,
		ExpectedVersion: &expVer,
	}, admin)
	if err != nil {
		t.Fatalf("CloseIssue error: %v", err)
	}
	if closedResp.Status != StatusClosed.String() {
		t.Errorf("expected status CLOSED, got %s", closedResp.Status)
	}
}

func TestIssueService_ReopenAndInvalidateAndPatch(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "6s_test_issue_svc_extra_*")
	defer os.RemoveAll(tempDir)

	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	mockStore.locations["LINE_A2"] = db.Location{Code: "LINE_A2", NameVi: "Chuyền May A2"}

	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	admin := db.User{ID: 1, Username: "admin", Role: "ADMIN", IsActive: true}
	otherWorker := db.User{ID: 20, Username: "worker2", Role: "USER", IsActive: true}

	mockStore.users[worker.ID] = worker
	mockStore.users[admin.ID] = admin
	mockStore.users[otherWorker.ID] = otherWorker

	storageMgr, _ := storage.NewManager(tempDir)
	notifyCh := make(chan struct{}, 10)
	svc := NewService(mockStore, storageMgr, notifyCh)

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)
	fhDetail := createTestFileHeader(t, "photo_detail", "detail.jpg", jpegBytes)

	// 1. Create issue with detail photo and tags
	clientUUID := "c0a80101-0000-4000-8000-000000000010"
	resp, created, err := svc.SyncIssue(context.Background(), SyncIssueRequest{
		ClientUUID:   clientUUID,
		Category:     "2S",
		LocationCode: "LINE_A1",
		Description:  "May A1 loi",
		Tags:         []string{"machine", "oil"},
		PhotoBefore:  fhBefore,
		PhotoDetail:  fhDetail,
	}, worker)
	if err != nil || !created {
		t.Fatalf("SyncIssue failed: %v", err)
	}

	// 2. Patch issue
	newCat := "3S"
	newLoc := "LINE_A2"
	newDesc := "Updated description text"
	patchResp, err := svc.PatchIssue(context.Background(), PatchIssueRequest{
		IssueID:      resp.ID,
		Category:     &newCat,
		LocationCode: &newLoc,
		Description:  &newDesc,
		Tags:         []string{"safety"},
	}, worker)
	if err != nil {
		t.Fatalf("PatchIssue error: %v", err)
	}
	if patchResp.Category != Category3S.String() || patchResp.LocationCode != "LINE_A2" || patchResp.Description == nil || *patchResp.Description != newDesc {
		t.Errorf("PatchIssue mismatch: %s, %s, %v", patchResp.Category, patchResp.LocationCode, patchResp.Description)
	}

	// Non-owner cannot patch
	_, err = svc.PatchIssue(context.Background(), PatchIssueRequest{
		IssueID:  resp.ID,
		Category: &newCat,
	}, otherWorker)
	if err != ErrPermissionDenied {
		t.Errorf("expected ErrPermissionDenied for non-owner, got %v", err)
	}

	// 3. Resolve issue
	fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpegBytes)
	resolveUUID := "c0a80101-0000-4000-8000-000000000020"
	resResp, err := svc.ResolveIssue(context.Background(), ResolveIssueRequest{
		IssueID:            resp.ID,
		ResolvedClientUUID: resolveUUID,
		ExpectedVersion:    patchResp.Version,
		PhotoAfter:         fhAfter,
	}, worker)
	if err != nil {
		t.Fatalf("ResolveIssue error: %v", err)
	}

	// 4. Reopen issue by creator
	expVer := resResp.Version
	reopenedResp, err := svc.ReopenIssue(context.Background(), ReopenIssueRequest{
		IssueID:         resResp.ID,
		RejectReason:    "Chưa sạch dầu",
		ExpectedVersion: &expVer,
	}, worker)
	if err != nil {
		t.Fatalf("ReopenIssue error: %v", err)
	}
	if reopenedResp.Status != StatusOpen.String() {
		t.Errorf("expected status OPEN after reopen, got %s", reopenedResp.Status)
	}

	// 5. Invalidate issue by Admin
	invVer := reopenedResp.Version
	invResp, err := svc.InvalidateIssue(context.Background(), InvalidateIssueRequest{
		IssueID:         reopenedResp.ID,
		Reason:          "Không phải lỗi 6S",
		ExpectedVersion: &invVer,
	}, admin)
	if err != nil {
		t.Fatalf("InvalidateIssue error: %v", err)
	}
	if invResp.Status != StatusInvalid.String() {
		t.Errorf("expected status INVALID, got %s", invResp.Status)
	}

	// Worker cannot invalidate
	_, err = svc.InvalidateIssue(context.Background(), InvalidateIssueRequest{
		IssueID: reopenedResp.ID,
		Reason:  "test",
	}, worker)
	if err != ErrPermissionDenied {
		t.Errorf("expected ErrPermissionDenied for worker invalidating, got %v", err)
	}
}

func TestIssueService_ValidationAndErrors(t *testing.T) {
	mockStore := newMockIssueStore()
	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}

	// Invalid category
	_, _, err := svc.SyncIssue(context.Background(), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000099",
		Category:     "INVALID_CAT",
		LocationCode: "LINE_A1",
	}, worker)
	if err == nil {
		t.Fatal("expected error for invalid category")
	}

	// Issue not found
	_, err = svc.GetIssueByID(context.Background(), 99999)
	if err != ErrIssueNotFound {
		t.Errorf("expected ErrIssueNotFound, got %v", err)
	}
}

func TestIssueService_ListIssuesFiltered(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	mockStore.users[worker.ID] = worker
	mockStore.issues[1] = db.Issue{
		ID:           1,
		ClientUuid:   "c0a80101-0000-4000-8000-000000000001",
		CreatorID:    worker.ID,
		Category:     Category1S.String(),
		LocationCode: "LINE_A1",
		Status:       StatusOpen.String(),
		CreatedAt:    time.Now(),
	}

	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))

	items, total, err := svc.ListIssuesFiltered(context.Background(), []string{StatusOpen.String()}, []string{Category1S.String()}, []string{"LINE_A1"}, 1, 10)
	if err != nil {
		t.Fatalf("ListIssuesFiltered err: %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Errorf("expected 1 item, got total=%d, len=%d", total, len(items))
	}
}

func TestIssueService_ForceResolveAndSafetyClose(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	worker := db.User{ID: 10, Username: "worker", Role: "USER", IsActive: true}
	safety := db.User{ID: 2, Username: "safety", Role: "SAFETY_OFFICER", IsActive: true}
	mockStore.users[worker.ID] = worker
	mockStore.users[safety.ID] = safety

	tempDir := t.TempDir()
	storageMgr, _ := storage.NewManager(tempDir)
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)
	fhAfter := createTestFileHeader(t, "photo_after", "after.jpg", jpegBytes)

	resp, _, err := svc.SyncIssue(context.Background(), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000077",
		Category:     Category6S.String(),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync 6S issue failed: %v", err)
	}

	// Force resolve
	resResp, err := svc.ResolveIssue(context.Background(), ResolveIssueRequest{
		IssueID:            resp.ID,
		ResolvedClientUUID: "c0a80101-0000-4000-8000-000000000078",
		Force:              true,
		PhotoAfter:         fhAfter,
	}, worker)
	if err != nil {
		t.Fatalf("Force resolve error: %v", err)
	}

	// Normal worker cannot close 6S issue
	_, err = svc.CloseIssue(context.Background(), CloseIssueRequest{
		IssueID:     resResp.ID,
		ScoreRating: 5,
	}, worker)
	if err != ErrPermissionDenied {
		t.Errorf("expected ErrPermissionDenied for worker closing 6S issue, got %v", err)
	}

	// Safety officer can close 6S issue
	closed, err := svc.CloseIssue(context.Background(), CloseIssueRequest{
		IssueID:     resResp.ID,
		ScoreRating: 5,
	}, safety)
	if err != nil {
		t.Fatalf("Safety officer close error: %v", err)
	}
	if closed.Status != StatusClosed.String() {
		t.Errorf("expected status CLOSED, got %s", closed.Status)
	}
}

func TestIssueService_CauseTypeClassification(t *testing.T) {
	mockStore := newMockIssueStore()
	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền May A1"}
	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, make(chan struct{}, 1))

	worker := db.User{
		ID:       1,
		Username: "worker1",
		FullName: "Worker One",
		Role:     "USER",
	}

	jpegBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9}
	fhBefore := createTestFileHeader(t, "photo_before", "before.jpg", jpegBytes)
	// 1. Explicit BEHAVIOR
	resp1, _, err := svc.SyncIssue(context.Background(), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000091",
		Category:     Category6S.String(),
		CauseType:    string(CauseTypeBehavior),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync issue 1 failed: %v", err)
	}
	if resp1.CauseType != string(CauseTypeBehavior) {
		t.Errorf("expected CauseType BEHAVIOR, got %s", resp1.CauseType)
	}

	// 2. Default 5S -> BEHAVIOR
	resp2, _, err := svc.SyncIssue(context.Background(), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000092",
		Category:     Category5S.String(),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync issue 2 failed: %v", err)
	}
	if resp2.CauseType != string(CauseTypeBehavior) {
		t.Errorf("expected CauseType BEHAVIOR for 5S, got %s", resp2.CauseType)
	}

	// 3. Default 1S -> CONDITION
	resp3, _, err := svc.SyncIssue(context.Background(), SyncIssueRequest{
		ClientUUID:   "c0a80101-0000-4000-8000-000000000093",
		Category:     Category1S.String(),
		LocationCode: "LINE_A1",
		PhotoBefore:  fhBefore,
	}, worker)
	if err != nil {
		t.Fatalf("Sync issue 3 failed: %v", err)
	}
	if resp3.CauseType != string(CauseTypeCondition) {
		t.Errorf("expected CauseType CONDITION for 1S, got %s", resp3.CauseType)
	}
}

func TestListIssuesFiltered_AttachTranslationCache(t *testing.T) {
	mockStore := newMockIssueStore()
	storageMgr, _ := storage.NewManager(t.TempDir())
	svc := NewService(mockStore, storageMgr, nil)

	desc := "Khu vực để đồ lộn xộn"
	h := ai.ComputeContentHash(desc)
	mockStore.translations[h+":en"] = "Cluttered storage area"

	mockStore.locations["LINE_A1"] = db.Location{Code: "LINE_A1", NameVi: "Chuyền A1"}
	mockStore.issues[1] = db.Issue{
		ID:           1,
		ClientUuid:   "c0a80101-0000-4000-8000-000000000099",
		LocationCode: "LINE_A1",
		Category:     "1S",
		Description:  sql.NullString{String: desc, Valid: true},
		Status:       "OPEN",
		CreatedAt:    time.Now(),
	}

	ctx := i18n.WithLocale(context.Background(), "en")
	resp, err := svc.GetIssueByID(ctx, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.TranslatedDescription == nil || *resp.TranslatedDescription != "Cluttered storage area" {
		t.Errorf("expected translated description 'Cluttered storage area', got %v", resp.TranslatedDescription)
	}

	items, _, err := svc.ListIssuesFiltered(ctx, nil, nil, nil, 1, 10)
	if err != nil {
		t.Fatalf("unexpected list error: %v", err)
	}
	if len(items) == 0 || items[0].TranslatedDescription == nil || *items[0].TranslatedDescription != "Cluttered storage area" {
		t.Errorf("expected list item to have translated description 'Cluttered storage area', got %+v", items)
	}
}
