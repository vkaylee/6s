package settings

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/db"
)

type mockSettingsStore struct {
	settings db.SystemSetting
}

func (m *mockSettingsStore) GetSystemSettings(_ context.Context) (db.SystemSetting, error) {
	return m.settings, nil
}

func (m *mockSettingsStore) UpdateSystemTimezone(_ context.Context, arg db.UpdateSystemTimezoneParams) (db.SystemSetting, error) {
	m.settings.Timezone = arg.Timezone
	return m.settings, nil
}

func (m *mockSettingsStore) InsertAuditLog(_ context.Context, _ db.InsertAuditLogParams) error {
	return nil
}

func TestHandler_TimezoneEndpoints(t *testing.T) {
	store := &mockSettingsStore{settings: db.SystemSetting{ID: 1, Timezone: "Asia/Ho_Chi_Minh"}}
	h := NewHandler(store)

	// GET
	req := httptest.NewRequest(http.MethodGet, "/api/admin/settings/timezone", nil)
	rr := httptest.NewRecorder()
	h.GetTimezone(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	// PATCH valid
	body, _ := json.Marshal(map[string]string{"timezone": "Asia/Tokyo"})
	req = httptest.NewRequest(http.MethodPatch, "/api/admin/settings/timezone", bytes.NewReader(body))
	rr = httptest.NewRecorder()
	h.UpdateTimezone(rr, req)
	if rr.Code != http.StatusOK || store.settings.Timezone != "Asia/Tokyo" {
		t.Fatalf("expected update to Asia/Tokyo, got %d and %s", rr.Code, store.settings.Timezone)
	}

	// PATCH invalid fixed offset
	body, _ = json.Marshal(map[string]string{"timezone": "UTC+7"})
	req = httptest.NewRequest(http.MethodPatch, "/api/admin/settings/timezone", bytes.NewReader(body))
	rr = httptest.NewRecorder()
	h.UpdateTimezone(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for fixed offset, got %d", rr.Code)
	}
}

var _ = sql.ErrNoRows
