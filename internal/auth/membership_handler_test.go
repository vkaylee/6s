package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"6s/internal/db"
)

type stubMembershipStore struct {
	memberships []db.ListLocationMembershipsRow
	upserts     []db.UpsertLocationMembershipParams
	deletes     []db.DeleteLocationMembershipParams
	audits      []db.InsertAuditLogParams
	getLoc      func(ctx context.Context, code string) (db.Location, error)
	getUser     func(ctx context.Context, id int64) (db.User, error)
}

func (s *stubMembershipStore) GetLocationByCode(ctx context.Context, code string) (db.Location, error) {
	if s.getLoc != nil {
		return s.getLoc(ctx, code)
	}
	return db.Location{Code: code, SiteID: 1}, nil
}

func (s *stubMembershipStore) GetUserByID(ctx context.Context, id int64) (db.User, error) {
	if s.getUser != nil {
		return s.getUser(ctx, id)
	}
	return db.User{ID: id, SiteID: 1, IsActive: true}, nil
}

func (s *stubMembershipStore) ListLocationMemberships(_ context.Context, _ string) ([]db.ListLocationMembershipsRow, error) {
	return s.memberships, nil
}

func (s *stubMembershipStore) UpsertLocationMembership(_ context.Context, arg db.UpsertLocationMembershipParams) (db.LocationMembership, error) {
	s.upserts = append(s.upserts, arg)
	return db.LocationMembership{
		UserID:             arg.UserID,
		ResponsibilityType: arg.ResponsibilityType,
	}, nil
}

func (s *stubMembershipStore) DeleteLocationMembership(_ context.Context, arg db.DeleteLocationMembershipParams) error {
	s.deletes = append(s.deletes, arg)
	return nil
}

func (s *stubMembershipStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	s.audits = append(s.audits, arg)
	return nil
}

func newMembershipRouter(h *LocationMembershipHandler) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/admin/locations/{code}/members", h.ListLocationMembers)
	r.Put("/api/admin/locations/{code}/members/{userID}", h.UpsertLocationMember)
	r.Delete("/api/admin/locations/{code}/members/{userID}", h.DeleteLocationMember)
	return r
}

func TestLocationMembershipHandler_List(t *testing.T) {
	store := &stubMembershipStore{
		memberships: []db.ListLocationMembershipsRow{{
			LocationCode:       "LINE_A1",
			UserID:             5,
			Username:           "alice",
			FullName:           "Alice",
			ResponsibilityType: "OWNER",
			ValidFrom:          time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			IsActive:           true,
		}},
	}
	router := newMembershipRouter(NewLocationMembershipHandler(store))
	req := httptest.NewRequest(http.MethodGet, "/api/admin/locations/LINE_A1/members", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var env struct {
		Data []LocationMembershipResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if len(env.Data) != 1 || env.Data[0].UserID != 5 || env.Data[0].ResponsibilityType != "OWNER" {
		t.Fatalf("unexpected body: %+v", env.Data)
	}
}

func TestLocationMembershipHandler_Upsert_RejectsInvalidType(t *testing.T) {
	store := &stubMembershipStore{}
	router := newMembershipRouter(NewLocationMembershipHandler(store))
	body := `{"responsibility_type":"GOD"}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/locations/LINE_A1/members/9", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	if len(store.upserts) != 0 {
		t.Fatalf("expected no upsert, got %d", len(store.upserts))
	}
}

func TestLocationMembershipHandler_Upsert_DateRangeError(t *testing.T) {
	store := &stubMembershipStore{}
	router := newMembershipRouter(NewLocationMembershipHandler(store))
	body := `{"responsibility_type":"OWNER","valid_from":"2026-01-02T00:00:00Z","valid_to":"2026-01-01T00:00:00Z"}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/locations/LINE_A1/members/9", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for inverted range, got %d", rec.Code)
	}
}

func TestLocationMembershipHandler_Upsert_NotFoundLocation(t *testing.T) {
	store := &stubMembershipStore{
		getLoc: func(_ context.Context, _ string) (db.Location, error) {
			return db.Location{}, sql.ErrNoRows
		},
	}
	router := newMembershipRouter(NewLocationMembershipHandler(store))
	body := `{"responsibility_type":"OWNER"}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/locations/MISSING/members/9", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestLocationMembershipHandler_Upsert_InvalidUserID(t *testing.T) {
	store := &stubMembershipStore{}
	router := newMembershipRouter(NewLocationMembershipHandler(store))
	req := httptest.NewRequest(http.MethodPut, "/api/admin/locations/LINE_A1/members/abc", bytes.NewBufferString(`{"responsibility_type":"OWNER"}`))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestLocationMembershipHandler_Upsert_HappyPath(t *testing.T) {
	store := &stubMembershipStore{}
	router := newMembershipRouter(NewLocationMembershipHandler(store))
	body := `{"responsibility_type":"BACKUP","is_active":true}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/locations/LINE_A1/members/9", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if len(store.upserts) != 1 {
		t.Fatalf("expected 1 upsert, got %d", len(store.upserts))
	}
	if store.upserts[0].ResponsibilityType != "BACKUP" {
		t.Fatalf("unexpected responsibility: %s", store.upserts[0].ResponsibilityType)
	}
	if len(store.audits) != 1 || store.audits[0].Action != "LOCATION_MEMBER_UPSERT" {
		t.Fatalf("expected audit, got %+v", store.audits)
	}
}

func TestLocationMembershipHandler_Delete_HappyPath(t *testing.T) {
	store := &stubMembershipStore{}
	router := newMembershipRouter(NewLocationMembershipHandler(store))
	req := httptest.NewRequest(http.MethodDelete, "/api/admin/locations/LINE_A1/members/9", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if len(store.deletes) != 1 {
		t.Fatalf("expected 1 delete, got %d", len(store.deletes))
	}
	if len(store.audits) != 1 || store.audits[0].Action != "LOCATION_MEMBER_DELETE" {
		t.Fatalf("expected audit, got %+v", store.audits)
	}
}

type stubTeamLocationStore struct {
	adds    []db.AddTeamLocationParams
	deletes []db.DeleteTeamLocationParams
	rows    []db.ListTeamLocationsRow
	audits  []db.InsertAuditLogParams
	getTeam func(ctx context.Context, id int64) (db.Team, error)
	getLoc  func(ctx context.Context, code string) (db.Location, error)
}

func (s *stubTeamLocationStore) GetTeamByID(ctx context.Context, id int64) (db.Team, error) {
	if s.getTeam != nil {
		return s.getTeam(ctx, id)
	}
	return db.Team{ID: id, SiteID: 1}, nil
}

func (s *stubTeamLocationStore) GetLocationByCode(ctx context.Context, code string) (db.Location, error) {
	if s.getLoc != nil {
		return s.getLoc(ctx, code)
	}
	return db.Location{Code: code, SiteID: 1}, nil
}

func (s *stubTeamLocationStore) ListTeamLocations(_ context.Context, _ int64) ([]db.ListTeamLocationsRow, error) {
	return s.rows, nil
}

func (s *stubTeamLocationStore) AddTeamLocation(_ context.Context, arg db.AddTeamLocationParams) error {
	s.adds = append(s.adds, arg)
	return nil
}

func (s *stubTeamLocationStore) DeleteTeamLocation(_ context.Context, arg db.DeleteTeamLocationParams) error {
	s.deletes = append(s.deletes, arg)
	return nil
}

func (s *stubTeamLocationStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	s.audits = append(s.audits, arg)
	return nil
}

func newTeamLocationRouter(h *TeamLocationHandler) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/admin/teams/{id}/locations", h.ListTeamLocations)
	r.Put("/api/admin/teams/{id}/locations/{code}", h.AddTeamLocation)
	r.Delete("/api/admin/teams/{id}/locations/{code}", h.DeleteTeamLocation)
	return r
}

func TestTeamLocationHandler_List_HappyPath(t *testing.T) {
	store := &stubTeamLocationStore{
		rows: []db.ListTeamLocationsRow{{
			TeamID:       1,
			LocationCode: "LINE_A1",
			CreatedAt:    time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			NameVi:       "Chuyền A1",
		}},
	}
	router := newTeamLocationRouter(NewTeamLocationHandler(store))
	req := httptest.NewRequest(http.MethodGet, "/api/admin/teams/1/locations", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var env struct {
		Data []TeamLocationResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if len(env.Data) != 1 || env.Data[0].LocationCode != "LINE_A1" {
		t.Fatalf("unexpected body: %+v", env.Data)
	}
}

func TestTeamLocationHandler_List_InvalidID(t *testing.T) {
	store := &stubTeamLocationStore{}
	router := newTeamLocationRouter(NewTeamLocationHandler(store))
	req := httptest.NewRequest(http.MethodGet, "/api/admin/teams/abc/locations", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestTeamLocationHandler_Add_HappyPath(t *testing.T) {
	store := &stubTeamLocationStore{}
	router := newTeamLocationRouter(NewTeamLocationHandler(store))
	req := httptest.NewRequest(http.MethodPut, "/api/admin/teams/"+strconv.FormatInt(1, 10)+"/locations/LINE_A1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if len(store.adds) != 1 {
		t.Fatalf("expected 1 add, got %d", len(store.adds))
	}
	if len(store.audits) != 1 || store.audits[0].Action != "TEAM_LOCATION_ADD" {
		t.Fatalf("expected audit, got %+v", store.audits)
	}
}

func TestTeamLocationHandler_Add_CrossSiteBlocked(t *testing.T) {
	store := &stubTeamLocationStore{
		getLoc: func(_ context.Context, _ string) (db.Location, error) {
			return db.Location{Code: "LINE_A1", SiteID: 99}, nil
		},
	}
	router := newTeamLocationRouter(NewTeamLocationHandler(store))
	req := httptest.NewRequest(http.MethodPut, "/api/admin/teams/1/locations/LINE_A1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for cross-site, got %d", rec.Code)
	}
	if len(store.adds) != 0 {
		t.Fatalf("expected no add call, got %d", len(store.adds))
	}
}

func TestTeamLocationHandler_Add_TeamNotFound(t *testing.T) {
	store := &stubTeamLocationStore{
		getTeam: func(_ context.Context, _ int64) (db.Team, error) {
			return db.Team{}, sql.ErrNoRows
		},
	}
	router := newTeamLocationRouter(NewTeamLocationHandler(store))
	req := httptest.NewRequest(http.MethodPut, "/api/admin/teams/1/locations/LINE_A1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestTeamLocationHandler_Delete_HappyPath(t *testing.T) {
	store := &stubTeamLocationStore{}
	router := newTeamLocationRouter(NewTeamLocationHandler(store))
	req := httptest.NewRequest(http.MethodDelete, "/api/admin/teams/1/locations/LINE_A1", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if len(store.deletes) != 1 {
		t.Fatalf("expected 1 delete, got %d", len(store.deletes))
	}
	if len(store.audits) != 1 || store.audits[0].Action != "TEAM_LOCATION_DELETE" {
		t.Fatalf("expected audit, got %+v", store.audits)
	}
}
