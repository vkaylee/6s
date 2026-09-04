package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"6s/internal/crypto"
	"6s/internal/db"
)

type mockFullStore struct {
	users        map[int64]db.User
	usersByName  map[string]db.User
	usersByBadge map[string]db.User
	tokens       map[string]db.RefreshToken
	adConfig     db.AdConfig
	auditLogs    []db.InsertAuditLogParams
}

func newMockFullStore() *mockFullStore {
	return &mockFullStore{
		users:        make(map[int64]db.User),
		usersByName:  make(map[string]db.User),
		usersByBadge: make(map[string]db.User),
		tokens:       make(map[string]db.RefreshToken),
	}
}

func (m *mockFullStore) GetUserByID(_ context.Context, id int64) (db.User, error) {
	u, ok := m.users[id]
	if !ok {
		return db.User{}, sql.ErrNoRows
	}
	return u, nil
}

func (m *mockFullStore) GetUserByUsername(_ context.Context, username string) (db.User, error) {
	u, ok := m.usersByName[username]
	if !ok {
		return db.User{}, sql.ErrNoRows
	}
	return u, nil
}

func (m *mockFullStore) GetUserByBadgeCode(_ context.Context, badgeCode sql.NullString) (db.User, error) {
	if !badgeCode.Valid {
		return db.User{}, sql.ErrNoRows
	}
	u, ok := m.usersByBadge[badgeCode.String]
	if !ok {
		return db.User{}, sql.ErrNoRows
	}
	return u, nil
}

func (m *mockFullStore) UpdateUserLastLogin(_ context.Context, _ int64) error {
	return nil
}

func (m *mockFullStore) CreateUserJIT(_ context.Context, arg db.CreateUserJITParams) (db.User, error) {
	u := db.User{
		ID:         int64(len(m.users) + 1),
		Username:   arg.Username,
		AuthSource: "AD",
		AdDn:       arg.AdDn,
		FullName:   arg.FullName,
		Email:      arg.Email,
		Role:       arg.Role,
		IsActive:   true,
	}
	m.users[u.ID] = u
	m.usersByName[u.Username] = u
	return u, nil
}

func (m *mockFullStore) UpdateUserADLogin(_ context.Context, arg db.UpdateUserADLoginParams) (db.User, error) {
	u := m.users[arg.ID]
	u.FullName = arg.FullName
	u.Email = arg.Email
	u.Role = arg.Role
	m.users[u.ID] = u
	m.usersByName[u.Username] = u
	return u, nil
}

func (m *mockFullStore) CreateRefreshToken(_ context.Context, arg db.CreateRefreshTokenParams) (db.RefreshToken, error) {
	t := db.RefreshToken{
		ID:         int64(len(m.tokens) + 1),
		UserID:     arg.UserID,
		TokenHash:  arg.TokenHash,
		DeviceInfo: arg.DeviceInfo,
		ExpiresAt:  arg.ExpiresAt,
		CreatedAt:  time.Now(),
	}
	m.tokens[arg.TokenHash] = t
	return t, nil
}

func (m *mockFullStore) GetRefreshTokenByHash(_ context.Context, tokenHash string) (db.RefreshToken, error) {
	t, ok := m.tokens[tokenHash]
	if !ok || t.RevokedAt.Valid || time.Now().After(t.ExpiresAt) {
		return db.RefreshToken{}, sql.ErrNoRows
	}
	return t, nil
}

func (m *mockFullStore) RevokeRefreshToken(_ context.Context, id int64) error {
	for k, v := range m.tokens {
		if v.ID == id {
			v.RevokedAt = sql.NullTime{Time: time.Now(), Valid: true}
			m.tokens[k] = v
			return nil
		}
	}
	return nil
}

func (m *mockFullStore) RevokeUserRefreshTokens(_ context.Context, userID int64) error {
	for k, v := range m.tokens {
		if v.UserID == userID {
			v.RevokedAt = sql.NullTime{Time: time.Now(), Valid: true}
			m.tokens[k] = v
		}
	}
	return nil
}

func (m *mockFullStore) ListUserActiveSessions(_ context.Context, userID int64) ([]db.ListUserActiveSessionsRow, error) {
	var rows []db.ListUserActiveSessionsRow
	for _, v := range m.tokens {
		if v.UserID == userID && !v.RevokedAt.Valid && time.Now().Before(v.ExpiresAt) {
			rows = append(rows, db.ListUserActiveSessionsRow{
				ID:         v.ID,
				DeviceInfo: v.DeviceInfo,
				CreatedAt:  v.CreatedAt,
				ExpiresAt:  v.ExpiresAt,
			})
		}
	}
	return rows, nil
}

func (m *mockFullStore) GetADConfig(_ context.Context) (db.AdConfig, error) {
	return m.adConfig, nil
}

func (m *mockFullStore) UpsertADConfig(_ context.Context, arg db.UpsertADConfigParams) (db.AdConfig, error) {
	m.adConfig = db.AdConfig{
		ID:            1,
		IsEnabled:     arg.IsEnabled,
		Server:        arg.Server,
		Port:          arg.Port,
		UseTls:        arg.UseTls,
		SkipTlsVerify: arg.SkipTlsVerify,
		BaseDn:        arg.BaseDn,
		BindDn:        arg.BindDn,
		BindPassword:  arg.BindPassword,
		UserFilter:    arg.UserFilter,
		GroupAdminDn:  arg.GroupAdminDn,
		GroupSafetyDn: arg.GroupSafetyDn,
		GroupLeaderDn: arg.GroupLeaderDn,
		UpdatedAt:     time.Now(),
	}
	return m.adConfig, nil
}

func (m *mockFullStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	m.auditLogs = append(m.auditLogs, arg)
	return nil
}

func TestHandler_LoginLocalAndTokenLifecycle(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)

	// Add local user
	hashedPass, _ := HashPassword("Secure123!")
	user := db.User{
		ID:           1,
		Username:     "worker1",
		PasswordHash: sql.NullString{String: hashedPass, Valid: true},
		AuthSource:   "LOCAL",
		Role:         "USER",
		FullName:     "Worker One",
		IsActive:     true,
	}
	store.users[user.ID] = user
	store.usersByName[user.Username] = user

	handler := NewHandler(store, tm, limiter, nil, nil)

	// 1. Wrong Password
	bodyWrong, _ := json.Marshal(LoginRequest{Username: "worker1", Password: "WrongPassword"})
	reqWrong := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(bodyWrong))
	rrWrong := httptest.NewRecorder()
	handler.Login(rrWrong, reqWrong)
	if rrWrong.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong pass, got %d", rrWrong.Code)
	}

	// 2. Correct Password
	bodyValid, _ := json.Marshal(LoginRequest{Username: "worker1", Password: "Secure123!"})
	reqValid := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(bodyValid))
	rrValid := httptest.NewRecorder()
	handler.Login(rrValid, reqValid)
	if rrValid.Code != http.StatusOK {
		t.Fatalf("expected 200 for correct pass, got %d", rrValid.Code)
	}

	var resp struct {
		Data struct {
			AccessToken  string       `json:"access_token"`
			RefreshToken string       `json:"refresh_token"`
			User         UserResponse `json:"user"`
		} `json:"data"`
	}
	if err := json.NewDecoder(rrValid.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode login response: %v", err)
	}
	if resp.Data.AccessToken == "" || resp.Data.RefreshToken == "" {
		t.Fatal("expected non-empty tokens")
	}
	if resp.Data.User.Username != "worker1" {
		t.Errorf("expected worker1, got %s", resp.Data.User.Username)
	}

	// 3. Refresh Token
	bodyRefresh, _ := json.Marshal(RefreshRequest{RefreshToken: resp.Data.RefreshToken})
	reqRefresh := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(bodyRefresh))
	rrRefresh := httptest.NewRecorder()
	handler.Refresh(rrRefresh, reqRefresh)
	if rrRefresh.Code != http.StatusOK {
		t.Fatalf("expected 200 for refresh, got %d", rrRefresh.Code)
	}

	var refreshResp struct {
		Data struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		} `json:"data"`
	}
	_ = json.NewDecoder(rrRefresh.Body).Decode(&refreshResp)
	if refreshResp.Data.AccessToken == "" || refreshResp.Data.RefreshToken == "" {
		t.Fatal("expected new tokens after rotation")
	}

	// 4. Old refresh token cannot be reused
	reqOldRefresh := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(bodyRefresh))
	rrOldRefresh := httptest.NewRecorder()
	handler.Refresh(rrOldRefresh, reqOldRefresh)
	if rrOldRefresh.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when reusing old refresh token, got %d", rrOldRefresh.Code)
	}

	// 5. Sessions list
	reqSessions := httptest.NewRequest("GET", "/api/auth/sessions", nil)
	ctxUser := context.WithValue(reqSessions.Context(), UserContextKey, user)
	rrSessions := httptest.NewRecorder()
	handler.Sessions(rrSessions, reqSessions.WithContext(ctxUser))
	if rrSessions.Code != http.StatusOK {
		t.Fatalf("expected 200 for sessions, got %d", rrSessions.Code)
	}

	// 6. Revoke
	bodyRevoke, _ := json.Marshal(RevokeRequest{})
	reqRevoke := httptest.NewRequest("POST", "/api/auth/revoke", bytes.NewReader(bodyRevoke))
	rrRevoke := httptest.NewRecorder()
	handler.Revoke(rrRevoke, reqRevoke.WithContext(ctxUser))
	if rrRevoke.Code != http.StatusOK {
		t.Fatalf("expected 200 for revoke, got %d", rrRevoke.Code)
	}
}

func TestADConfigHandler_CRUDAndTest(t *testing.T) {
	store := newMockFullStore()
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901") // 32 bytes
	mockLDAP := &MockLDAPClient{}

	adminUser := db.User{ID: 1, Role: "ADMIN", FullName: "Admin", IsActive: true}
	adHandler := NewADConfigHandler(store, cipher, mockLDAP)

	// Update AD Config
	updateReq := UpdateADConfigRequest{
		IsEnabled:     true,
		Server:        "ad.factory.lan",
		Port:          636,
		UseTLS:        true,
		BaseDN:        "DC=factory,DC=lan",
		BindDN:        "CN=svc,DC=factory,DC=lan",
		BindPassword:  "P@ssw0rdBind",
		GroupAdminDN:  "CN=Admins,DC=factory,DC=lan",
		GroupSafetyDN: "CN=Safety,DC=factory,DC=lan",
		GroupLeaderDN: "CN=Leaders,DC=factory,DC=lan",
	}
	body, _ := json.Marshal(updateReq)
	req := httptest.NewRequest("PUT", "/api/config/ad", bytes.NewReader(body))
	ctxAdmin := context.WithValue(req.Context(), UserContextKey, adminUser)
	rr := httptest.NewRecorder()
	adHandler.UpdateADConfig(rr, req.WithContext(ctxAdmin))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on update AD config, got %d", rr.Code)
	}

	// Get AD Config
	reqGet := httptest.NewRequest("GET", "/api/config/ad", nil)
	rrGet := httptest.NewRecorder()
	adHandler.GetADConfig(rrGet, reqGet.WithContext(ctxAdmin))
	if rrGet.Code != http.StatusOK {
		t.Fatalf("expected 200 on get AD config, got %d", rrGet.Code)
	}
	var getResp struct {
		Data ADConfigResponse `json:"data"`
	}
	_ = json.NewDecoder(rrGet.Body).Decode(&getResp)
	if !getResp.Data.HasBindPassword {
		t.Error("expected has_bind_password to be true")
	}
	if !getResp.Data.IsEnabled {
		t.Error("expected is_enabled to be true")
	}

	// Test AD Connection
	reqTest := httptest.NewRequest("POST", "/api/config/ad/test", bytes.NewReader([]byte("{}")))
	rrTest := httptest.NewRecorder()
	adHandler.TestADConfig(rrTest, reqTest.WithContext(ctxAdmin))
	if rrTest.Code != http.StatusOK {
		t.Fatalf("expected 200 on test AD config, got %d", rrTest.Code)
	}
}
