package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/crypto"
	"6s/internal/db"
)

func TestADConfigPUTPreservesOmittedFieldsAndReadback(t *testing.T) {
	store := newMockFullStore()
	cipher, err := crypto.NewCipher("01234567890123456789012345678901")
	if err != nil {
		t.Fatal(err)
	}
	handler := NewADConfigHandler(store, cipher, &MockLDAPClient{})
	admin := db.User{ID: 1, Role: RoleAdmin.String(), IsActive: true}
	ctx := context.WithValue(context.Background(), UserContextKey, admin)

	initial := []byte(`{"is_enabled":true,"server":"ad.factory.lan","port":636,"use_tls":true,"skip_tls_verify":true,"base_dn":"DC=factory,DC=lan","bind_dn":"CN=svc,DC=factory,DC=lan","bind_password":" exact bind password ","user_filter":"(&(objectClass=user)(uid=%s))","group_admin_dn":"CN=Admins,DC=factory,DC=lan","group_safety_dn":"CN=Safety,DC=factory,DC=lan","group_leader_dn":"CN=Leaders,DC=factory,DC=lan"}`)
	initialReq := httptest.NewRequest(http.MethodPut, "/api/config/ad", bytes.NewReader(initial)).WithContext(ctx)
	initialResp := httptest.NewRecorder()
	handler.UpdateADConfig(initialResp, initialReq)
	if initialResp.Code != http.StatusOK {
		t.Fatalf("initial update status = %d, body = %s", initialResp.Code, initialResp.Body.String())
	}

	partialReq := httptest.NewRequest(http.MethodPut, "/api/config/ad", bytes.NewReader([]byte(`{"is_enabled":false}`))).WithContext(ctx)
	partialResp := httptest.NewRecorder()
	handler.UpdateADConfig(partialResp, partialReq)
	if partialResp.Code != http.StatusOK {
		t.Fatalf("partial update status = %d, body = %s", partialResp.Code, partialResp.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/config/ad", nil).WithContext(ctx)
	getResp := httptest.NewRecorder()
	handler.GetADConfig(getResp, getReq)
	if getResp.Code != http.StatusOK {
		t.Fatalf("readback status = %d, body = %s", getResp.Code, getResp.Body.String())
	}
	var envelope struct {
		Data ADConfigResponse `json:"data"`
	}
	if err := json.NewDecoder(getResp.Body).Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	got := envelope.Data
	if got.IsEnabled {
		t.Fatal("explicit is_enabled=false was not applied")
	}
	if !got.SkipTLSVerify || got.UserFilter != "(&(objectClass=user)(uid=%s))" {
		t.Fatalf("omitted TLS/filter fields were reset: %+v", got)
	}
	if got.GroupAdminDN != "CN=Admins,DC=factory,DC=lan" || got.GroupSafetyDN != "CN=Safety,DC=factory,DC=lan" || got.GroupLeaderDN != "CN=Leaders,DC=factory,DC=lan" {
		t.Fatalf("omitted group mappings were reset: %+v", got)
	}
	if !got.HasBindPassword {
		t.Fatal("blank bind password update cleared the stored bind password")
	}
}

type adConfigReadErrorStore struct {
	*mockFullStore
	err error
}

func (s *adConfigReadErrorStore) GetADConfig(context.Context) (db.AdConfig, error) {
	return db.AdConfig{}, s.err
}

func (s *adConfigReadErrorStore) UpsertADConfig(context.Context, db.UpsertADConfigParams) (db.AdConfig, error) {
	panic("UpsertADConfig must not be called after a config read error")
}

func TestADConfigPUTDoesNotWriteAfterConfigReadError(t *testing.T) {
	store := &adConfigReadErrorStore{mockFullStore: newMockFullStore(), err: context.DeadlineExceeded}
	handler := NewADConfigHandler(store, nil, &MockLDAPClient{})
	admin := db.User{ID: 1, Role: RoleAdmin.String(), IsActive: true}
	req := httptest.NewRequest(http.MethodPut, "/api/config/ad", bytes.NewReader([]byte(`{"is_enabled":false}`))).WithContext(context.WithValue(context.Background(), UserContextKey, admin))
	resp := httptest.NewRecorder()
	handler.UpdateADConfig(resp, req)
	if resp.Code != http.StatusInternalServerError {
		t.Fatalf("read failure status = %d, want 500", resp.Code)
	}
}
