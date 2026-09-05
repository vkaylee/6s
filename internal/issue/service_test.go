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

	"6s/internal/db"
	"6s/internal/storage"
)

type mockIssueStore struct {
	issues    map[int64]db.Issue
	locations map[string]db.Location
	tags      map[int64][]string
	users     map[int64]db.User
	outbox    []db.CreateOutboxEntryParams
	scoreLogs []db.InsertScoreLogParams
	auditLogs []db.InsertAuditLogParams
}

func newMockIssueStore() *mockIssueStore {
	return &mockIssueStore{
		issues:    make(map[int64]db.Issue),
		locations: make(map[string]db.Location),
		tags:      make(map[int64][]string),
		users:     make(map[int64]db.User),
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
	if arg.LocationCode.Valid {
		iss.LocationCode = arg.LocationCode.String
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
