package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"6s/internal/auth"
	"6s/internal/crypto"
	"6s/internal/db"
)

type mockConfigStore struct {
	cfg       db.NotificationConfig
	auditLogs []db.InsertAuditLogParams
}

func (m *mockConfigStore) GetNotificationConfig(_ context.Context) (db.NotificationConfig, error) {
	return m.cfg, nil
}

func (m *mockConfigStore) UpsertNotificationConfig(_ context.Context, arg db.UpsertNotificationConfigParams) (db.NotificationConfig, error) {
	m.cfg = db.NotificationConfig{
		WxpusherEnabled:  arg.WxpusherEnabled,
		WxpusherAppToken: arg.WxpusherAppToken,
		LanWebhookUrl:    arg.LanWebhookUrl,
		PublicBaseUrl:    arg.PublicBaseUrl,
		UpdatedAt:        time.Now(),
	}
	return m.cfg, nil
}

func (m *mockConfigStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	m.auditLogs = append(m.auditLogs, arg)
	return nil
}

func TestNotificationConfigHandler(t *testing.T) {
	cipher, _ := crypto.NewCipher("MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=")
	store := &mockConfigStore{
		cfg: db.NotificationConfig{
			WxpusherEnabled:  true,
			WxpusherAppToken: "token",
			LanWebhookUrl:    "https://hook.lan",
			PublicBaseUrl:    "https://6s.factory.lan",
			UpdatedAt:        time.Now(),
		},
	}
	sender := &mockSender{}
	handler := NewConfigHandler(store, cipher, sender)
	adminUser := db.User{ID: 1, Role: "ADMIN"}

	// 1. GET /api/config/notifications
	reqGet := httptest.NewRequest("GET", "/api/config/notifications", nil)
	rrGet := httptest.NewRecorder()
	handler.GetConfig(rrGet, reqGet)
	if rrGet.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rrGet.Code)
	}

	// 2. PUT /api/config/notifications
	putBody, _ := json.Marshal(UpdateConfigRequest{
		WxPusherAppToken: "new-secret-token",
		LANWebhookURL:    "https://lan.internal/webhook",
	})
	reqPut := httptest.NewRequest("PUT", "/api/config/notifications", bytes.NewReader(putBody))
	ctxUser := context.WithValue(reqPut.Context(), auth.UserContextKey, adminUser)
	rrPut := httptest.NewRecorder()
	handler.UpdateConfig(rrPut, reqPut.WithContext(ctxUser))
	if rrPut.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rrPut.Code)
	}

	// 3. POST /api/config/notifications/test
	reqTest := httptest.NewRequest("POST", "/api/config/notifications/test", nil)
	rrTest := httptest.NewRecorder()
	handler.TestConfig(rrTest, reqTest)
	if rrTest.Code != http.StatusOK {
		t.Fatalf("expected 200 for test, got %d", rrTest.Code)
	}
}
