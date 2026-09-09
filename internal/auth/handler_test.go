package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/i18n"
)

type mockFullStore struct {
	mu           sync.Mutex
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
	m.users[u.ID] = u
	m.usersByName[u.Username] = u
	return u, nil
}

func (m *mockFullStore) CreateRefreshToken(_ context.Context, arg db.CreateRefreshTokenParams) (db.RefreshToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
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
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tokens[tokenHash]
	if !ok || t.RevokedAt.Valid || time.Now().After(t.ExpiresAt) {
		return db.RefreshToken{}, sql.ErrNoRows
	}
	return t, nil
}

func (m *mockFullStore) GetRefreshTokenByHashAnyState(_ context.Context, tokenHash string) (db.RefreshToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tokens[tokenHash]
	if !ok {
		return db.RefreshToken{}, sql.ErrNoRows
	}
	return t, nil
}

func (m *mockFullStore) RotateRefreshToken(_ context.Context, oldID int64, arg db.CreateRefreshTokenParams) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for key, old := range m.tokens {
		if old.ID != oldID {
			continue
		}
		if old.RevokedAt.Valid {
			return sql.ErrNoRows
		}
		old.RevokedAt = sql.NullTime{Time: time.Now(), Valid: true}
		m.tokens[key] = old
		m.tokens[arg.TokenHash] = db.RefreshToken{
			ID:         int64(len(m.tokens) + 1),
			UserID:     arg.UserID,
			TokenHash:  arg.TokenHash,
			DeviceInfo: arg.DeviceInfo,
			ExpiresAt:  arg.ExpiresAt,
			CreatedAt:  time.Now(),
		}
		return nil
	}
	return sql.ErrNoRows
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

func (m *mockFullStore) CountAdmins(_ context.Context) (int64, error) {
	var count int64
	for _, u := range m.users {
		if u.Role == RoleAdmin.String() && u.IsActive {
			count++
		}
	}
	return count, nil
}

func (m *mockFullStore) CreateLocalAdmin(_ context.Context, arg db.CreateLocalAdminParams) (db.User, error) {
	u := db.User{
		ID:           int64(len(m.users) + 1),
		Username:     arg.Username,
		PasswordHash: arg.PasswordHash,
		AuthSource:   "LOCAL",
		FullName:     arg.FullName,
		Email:        arg.Email,
		Role:         RoleAdmin.String(),
		IsActive:     true,
	}
	m.users[u.ID] = u
	m.usersByName[u.Username] = u
	return u, nil
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
		Role:         RoleUser.String(),
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
			AccessToken  string       `json:"access_token"`
			RefreshToken string       `json:"refresh_token"`
			User         UserResponse `json:"user"`
		} `json:"data"`
	}
	_ = json.NewDecoder(rrRefresh.Body).Decode(&refreshResp)
	if refreshResp.Data.AccessToken == "" || refreshResp.Data.RefreshToken == "" {
		t.Fatal("expected new tokens after rotation")
	}
	if refreshResp.Data.User.Role != RoleUser.String() {
		t.Errorf("expected refresh response to include current user role, got %s", refreshResp.Data.User.Role)
	}

	// Simulate operator promoting the user to admin while session is active.
	storedUser := store.users[1]
	storedUser.Role = RoleAdmin.String()
	store.users[1] = storedUser
	store.usersByName[storedUser.Username] = storedUser

	bodyRefresh2, _ := json.Marshal(RefreshRequest{RefreshToken: refreshResp.Data.RefreshToken})
	reqRefresh2 := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(bodyRefresh2))
	rrRefresh2 := httptest.NewRecorder()
	handler.Refresh(rrRefresh2, reqRefresh2)
	if rrRefresh2.Code != http.StatusOK {
		t.Fatalf("expected 200 for refresh after role change, got %d", rrRefresh2.Code)
	}
	var refreshResp2 struct {
		Data struct {
			User UserResponse `json:"user"`
		} `json:"data"`
	}
	_ = json.NewDecoder(rrRefresh2.Body).Decode(&refreshResp2)
	if refreshResp2.Data.User.Role != RoleAdmin.String() {
		t.Errorf("expected refresh response to reflect promoted ADMIN role, got %s", refreshResp2.Data.User.Role)
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

	adminUser := db.User{ID: 1, Role: RoleAdmin.String(), FullName: "Admin", IsActive: true}
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

func TestHandler_SetupSuperadmin(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	handler := NewHandler(store, tm, limiter, nil, nil)

	// 1. Initial check: NeedsSetup should be true
	reqStatus := httptest.NewRequest("GET", "/api/auth/setup-status", nil)
	rrStatus := httptest.NewRecorder()
	handler.SetupStatus(rrStatus, reqStatus)
	if rrStatus.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rrStatus.Code)
	}
	var statusResp struct {
		Data SetupStatusResponse `json:"data"`
	}
	_ = json.NewDecoder(rrStatus.Body).Decode(&statusResp)
	if !statusResp.Data.NeedsSetup {
		t.Error("expected NeedsSetup to be true initially")
	}

	// 2. Setup superadmin successfully
	bodySetup, _ := json.Marshal(SetupSuperadminRequest{
		Username: "admin",
		Password: "SuperAdminPassword123!",
		FullName: "System Superadmin",
		Email:    "admin@factory.lan",
	})
	reqSetup := httptest.NewRequest("POST", "/api/auth/setup", bytes.NewReader(bodySetup))
	reqSetup = reqSetup.WithContext(context.WithValue(reqSetup.Context(), UserContextKey, db.User{ID: 99, IsActive: true}))
	rrSetup := httptest.NewRecorder()
	handler.SetupSuperadmin(rrSetup, reqSetup)
	if rrSetup.Code != http.StatusOK {
		t.Fatalf("expected 200 on setup, got %d: %s", rrSetup.Code, rrSetup.Body.String())
	}

	// 3. Subsequent check: NeedsSetup should be false
	rrStatus2 := httptest.NewRecorder()
	handler.SetupStatus(rrStatus2, reqStatus)
	var statusResp2 struct {
		Data SetupStatusResponse `json:"data"`
	}
	_ = json.NewDecoder(rrStatus2.Body).Decode(&statusResp2)
	if statusResp2.Data.NeedsSetup {
		t.Error("expected NeedsSetup to be false after setup")
	}
	rrSetupRepeat := httptest.NewRecorder()
	reqSetupRepeat := httptest.NewRequest("POST", "/api/auth/setup", bytes.NewReader(bodySetup))
	reqSetupRepeat = reqSetupRepeat.WithContext(context.WithValue(reqSetupRepeat.Context(), UserContextKey, db.User{ID: 99, IsActive: true}))
	handler.SetupSuperadmin(rrSetupRepeat, reqSetupRepeat)
	if rrSetupRepeat.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on repeated setup, got %d", rrSetupRepeat.Code)
	}
}

func TestHandler_RevokeAndSessions(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901")
	handler := NewHandler(store, tm, limiter, cipher, nil)
	user := db.User{
		ID:       10,
		Username: "worker",
		FullName: "Worker",
		Role:     RoleUser.String(),
		IsActive: true,
	}
	store.users[user.ID] = user
	store.usersByName[user.Username] = user

	// Seed active refresh token
	_, hash, _ := GenerateRefreshToken()
	_, _ = store.CreateRefreshToken(context.Background(), db.CreateRefreshTokenParams{
		UserID:     user.ID,
		TokenHash:  hash,
		ExpiresAt:  time.Now().Add(24 * time.Hour),
		DeviceInfo: sql.NullString{String: "Chrome on Linux", Valid: true},
	})

	// 1. List active sessions
	reqSessions := httptest.NewRequest("GET", "/api/auth/sessions", nil)
	ctxUser := context.WithValue(reqSessions.Context(), UserContextKey, user)
	rrSessions := httptest.NewRecorder()
	handler.Sessions(rrSessions, reqSessions.WithContext(ctxUser))
	if rrSessions.Code != http.StatusOK {
		t.Fatalf("expected 200 for sessions, got %d", rrSessions.Code)
	}

	// 2. Revoke current user refresh tokens
	revokeBody, _ := json.Marshal(RevokeRequest{})
	reqRevoke := httptest.NewRequest("POST", "/api/auth/revoke", bytes.NewReader(revokeBody))
	rrRevoke := httptest.NewRecorder()
	handler.Revoke(rrRevoke, reqRevoke.WithContext(ctxUser))
	if rrRevoke.Code != http.StatusOK {
		t.Fatalf("expected 200 for revoke, got %d", rrRevoke.Code)
	}

	// 3. Verify sessions are now empty
	rrSessionsAfter := httptest.NewRecorder()
	handler.Sessions(rrSessionsAfter, reqSessions.WithContext(ctxUser))
	var sessionsList []map[string]any
	_ = json.NewDecoder(rrSessionsAfter.Body).Decode(&sessionsList)
	if len(sessionsList) != 0 {
		t.Errorf("expected 0 active sessions after revocation, got %d", len(sessionsList))
	}
}

func TestHandler_LoginAD_JITProvision(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901")
	mockLDAP := &MockLDAPClient{
		UserToReturn: &LDAPUser{
			Username:    "aduser",
			DN:          "CN=AD User,DC=factory,DC=lan",
			FullName:    "AD User",
			Email:       "aduser@factory.lan",
			MatchedRole: RoleLineLeader.String(),
		},
	}
	handler := NewHandler(store, tm, limiter, cipher, mockLDAP)

	// Seed enabled AD config
	store.adConfig = db.AdConfig{
		IsEnabled: true,
		Server:    "ad.factory.lan",
		Port:      636,
	}

	loginReq := LoginRequest{
		Username: "aduser",
		Password: "adpassword",
	}
	body, _ := json.Marshal(loginReq)
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	handler.Login(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 for AD login, got %d", rr.Code)
	}

	// Verify JIT created user
	u, err := store.GetUserByUsername(context.Background(), "aduser")
	if err != nil {
		t.Fatalf("expected user created via JIT: %v", err)
	}
	if u.Role != RoleLineLeader.String() {
		t.Errorf("expected role LINE_LEADER, got %s", u.Role)
	}
}

func TestHandler_LoginAD_PreservesManuallyPromotedRole(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901")
	// Existing AD user already promoted to admin by an operator.
	promotedUser := db.User{
		ID:         1,
		Username:   "aduser",
		AuthSource: "AD",
		AdDn:       sql.NullString{String: "CN=AD User,DC=factory,DC=lan", Valid: true},
		FullName:   "AD User",
		Email:      sql.NullString{String: "aduser@factory.lan", Valid: true},
		Role:       RoleAdmin.String(),
		IsActive:   true,
	}
	store.users[promotedUser.ID] = promotedUser
	store.usersByName[promotedUser.Username] = promotedUser
	// AD still reports the user as a regular line leader.
	mockLDAP := &MockLDAPClient{
		UserToReturn: &LDAPUser{
			Username:    "aduser",
			DN:          "CN=AD User,DC=factory,DC=lan",
			FullName:    "AD User",
			Email:       "aduser@factory.lan",
			MatchedRole: RoleLineLeader.String(),
		},
	}
	handler := NewHandler(store, tm, limiter, cipher, mockLDAP)
	store.adConfig = db.AdConfig{IsEnabled: true, Server: "ad.factory.lan", Port: 636}

	body, _ := json.Marshal(LoginRequest{Username: "aduser", Password: "adpassword"})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	handler.Login(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 for AD re-login, got %d", rr.Code)
	}
	u, err := store.GetUserByUsername(context.Background(), "aduser")
	if err != nil {
		t.Fatalf("expected user still present: %v", err)
	}
	if u.Role != RoleAdmin.String() {
		t.Errorf("expected manually promoted ADMIN role preserved, got %s", u.Role)
	}
}

func TestHandler_LoginLocalAdminWithADEnabled(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	hashed, err := HashPassword("LocalAdmin123!")
	if err != nil {
		t.Fatal(err)
	}
	store.usersByName["admin"] = db.User{ID: 1, Username: "admin", PasswordHash: sql.NullString{String: hashed, Valid: true}, AuthSource: "LOCAL", Role: RoleAdmin.String(), IsActive: true}
	store.adConfig = db.AdConfig{IsEnabled: true, Server: "ad.factory.lan", Port: 636}
	handler := NewHandler(store, tm, limiter, nil, &MockLDAPClient{ErrToReturn: errors.New("AD unavailable")})
	body, _ := json.Marshal(LoginRequest{Username: "admin", Password: "LocalAdmin123!"})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	handler.Login(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected local admin login with AD enabled to succeed, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestHandler_CreateTicket(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901")
	ticketMgr := NewTicketManager()
	handler := NewHandler(store, tm, limiter, cipher, nil, ticketMgr)

	// 1. Unauthenticated request fails
	reqUnauth := httptest.NewRequest("POST", "/api/auth/ticket", nil)
	rrUnauth := httptest.NewRecorder()
	handler.CreateTicket(rrUnauth, reqUnauth)
	if rrUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated ticket request, got %d", rrUnauth.Code)
	}

	// 2. Authenticated request succeeds and issues consumable ticket
	user := db.User{ID: 10, Username: "testuser", IsActive: true}
	reqAuth := httptest.NewRequest("POST", "/api/auth/ticket", nil)
	reqAuth = reqAuth.WithContext(context.WithValue(reqAuth.Context(), UserContextKey, user))
	rrAuth := httptest.NewRecorder()
	handler.CreateTicket(rrAuth, reqAuth)

	if rrAuth.Code != http.StatusOK {
		t.Fatalf("expected 200 for authenticated ticket request, got %d", rrAuth.Code)
	}

	var resp struct {
		Data map[string]string `json:"data"`
	}
	if err := json.Unmarshal(rrAuth.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode ticket response: %v", err)
	}
	ticket := resp.Data["ticket"]
	if ticket == "" {
		t.Fatal("expected non-empty ticket in response")
	}

	// Verify issued ticket is valid for user 10
	consumedUserID, err := ticketMgr.Consume(ticket)
	if err != nil {
		t.Fatalf("failed to consume issued ticket: %v", err)
	}
	if consumedUserID != 10 {
		t.Fatalf("expected ticket bound to userID 10, got %d", consumedUserID)
	}
}

func TestHandler_RefreshAndRevokeAndSessions(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901")
	ticketMgr := NewTicketManager()
	handler := NewHandler(store, tm, limiter, cipher, nil, ticketMgr)

	user := db.User{ID: 1, Username: "worker", Role: RoleUser.String(), IsActive: true}
	admin := db.User{ID: 2, Username: "admin", Role: RoleAdmin.String(), IsActive: true}
	store.users[user.ID] = user
	store.users[admin.ID] = admin

	// 1. Refresh with empty body
	reqRefEmpty := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader([]byte("{}")))
	rrRefEmpty := httptest.NewRecorder()
	handler.Refresh(rrRefEmpty, reqRefEmpty)
	if rrRefEmpty.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty refresh, got %d", rrRefEmpty.Code)
	}

	// 2. Refresh with invalid token
	reqRefInv := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader([]byte(`{"refresh_token":"fake"}`)))
	rrRefInv := httptest.NewRecorder()
	handler.Refresh(rrRefInv, reqRefInv)
	if rrRefInv.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for invalid refresh token, got %d", rrRefInv.Code)
	}

	// 3. Refresh with valid token
	rawToken, hash, _ := GenerateRefreshToken()
	_, _ = store.CreateRefreshToken(context.Background(), db.CreateRefreshTokenParams{
		UserID:    user.ID,
		TokenHash: hash,
		ExpiresAt: time.Now().Add(time.Hour),
	})
	refBody, _ := json.Marshal(RefreshRequest{RefreshToken: rawToken})
	reqRefValid := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewReader(refBody))
	rrRefValid := httptest.NewRecorder()
	handler.Refresh(rrRefValid, reqRefValid)
	if rrRefValid.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid refresh, got %d, body: %s", rrRefValid.Code, rrRefValid.Body.String())
	}

	// 4. Revoke unauthenticated
	reqRevUnauth := httptest.NewRequest("POST", "/api/auth/revoke", nil)
	rrRevUnauth := httptest.NewRecorder()
	handler.Revoke(rrRevUnauth, reqRevUnauth)
	if rrRevUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth revoke, got %d", rrRevUnauth.Code)
	}

	// 5. Revoke bad JSON
	reqRevBad := httptest.NewRequest("POST", "/api/auth/revoke", bytes.NewReader([]byte("{invalid")))
	reqRevBad = reqRevBad.WithContext(context.WithValue(reqRevBad.Context(), UserContextKey, user))
	rrRevBad := httptest.NewRecorder()
	handler.Revoke(rrRevBad, reqRevBad)
	if rrRevBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json revoke, got %d", rrRevBad.Code)
	}

	// 6. Revoke forbidden (non-admin targeting other user)
	otherID := int64(99)
	revOtherBody, _ := json.Marshal(RevokeRequest{UserID: &otherID})
	reqRevForbid := httptest.NewRequest("POST", "/api/auth/revoke", bytes.NewReader(revOtherBody))
	reqRevForbid = reqRevForbid.WithContext(context.WithValue(reqRevForbid.Context(), UserContextKey, user))
	rrRevForbid := httptest.NewRecorder()
	handler.Revoke(rrRevForbid, reqRevForbid)
	if rrRevForbid.Code != http.StatusForbidden {
		t.Errorf("expected 403 for forbidden revoke, got %d", rrRevForbid.Code)
	}

	// 7. Revoke as admin targeting other user
	reqRevAdmin := httptest.NewRequest("POST", "/api/auth/revoke", bytes.NewReader(revOtherBody))
	reqRevAdmin = reqRevAdmin.WithContext(context.WithValue(reqRevAdmin.Context(), UserContextKey, admin))
	rrRevAdmin := httptest.NewRecorder()
	handler.Revoke(rrRevAdmin, reqRevAdmin)
	if rrRevAdmin.Code != http.StatusOK {
		t.Errorf("expected 200 for admin revoke other user, got %d", rrRevAdmin.Code)
	}

	// 8. Revoke specific token ID
	tokID := int64(1)
	revTokBody, _ := json.Marshal(RevokeRequest{RefreshTokenID: &tokID})
	reqRevTok := httptest.NewRequest("POST", "/api/auth/revoke", bytes.NewReader(revTokBody))
	reqRevTok = reqRevTok.WithContext(context.WithValue(reqRevTok.Context(), UserContextKey, user))
	rrRevTok := httptest.NewRecorder()
	handler.Revoke(rrRevTok, reqRevTok)
	if rrRevTok.Code != http.StatusOK {
		t.Errorf("expected 200 for revoke token id, got %d", rrRevTok.Code)
	}

	// 9. Revoke self default
	reqRevSelf := httptest.NewRequest("POST", "/api/auth/revoke", bytes.NewReader([]byte("{}")))
	reqRevSelf = reqRevSelf.WithContext(context.WithValue(reqRevSelf.Context(), UserContextKey, user))
	rrRevSelf := httptest.NewRecorder()
	handler.Revoke(rrRevSelf, reqRevSelf)
	if rrRevSelf.Code != http.StatusOK {
		t.Errorf("expected 200 for revoke self, got %d", rrRevSelf.Code)
	}

	// 10. Sessions unauth
	reqSessUnauth := httptest.NewRequest("GET", "/api/auth/sessions", nil)
	rrSessUnauth := httptest.NewRecorder()
	handler.Sessions(rrSessUnauth, reqSessUnauth)
	if rrSessUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth sessions, got %d", rrSessUnauth.Code)
	}

	// 11. Sessions non-admin query other user (403)
	reqSessForbid := httptest.NewRequest("GET", "/api/auth/sessions?user_id=2", nil)
	reqSessForbid = reqSessForbid.WithContext(context.WithValue(reqSessForbid.Context(), UserContextKey, user))
	rrSessForbid := httptest.NewRecorder()
	handler.Sessions(rrSessForbid, reqSessForbid)
	if rrSessForbid.Code != http.StatusForbidden {
		t.Errorf("expected 403 for sessions forbidden, got %d", rrSessForbid.Code)
	}

	// 12. Sessions admin invalid query user_id (400)
	reqSessBad := httptest.NewRequest("GET", "/api/auth/sessions?user_id=abc", nil)
	reqSessBad = reqSessBad.WithContext(context.WithValue(reqSessBad.Context(), UserContextKey, admin))
	rrSessBad := httptest.NewRecorder()
	handler.Sessions(rrSessBad, reqSessBad)
	if rrSessBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for sessions bad user_id, got %d", rrSessBad.Code)
	}

	// 13. Sessions admin valid query user_id (200)
	reqSessAdmin := httptest.NewRequest("GET", "/api/auth/sessions?user_id=1", nil)
	reqSessAdmin = reqSessAdmin.WithContext(context.WithValue(reqSessAdmin.Context(), UserContextKey, admin))
	rrSessAdmin := httptest.NewRecorder()
	handler.Sessions(rrSessAdmin, reqSessAdmin)
	if rrSessAdmin.Code != http.StatusOK {
		t.Errorf("expected 200 for sessions admin query, got %d", rrSessAdmin.Code)
	}
}

func TestHandler_SetupAndErrors(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901")
	ticketMgr := NewTicketManager()
	handler := NewHandler(store, tm, limiter, cipher, nil, ticketMgr)

	// 1. SetupStatus with 0 admins
	reqStatus := httptest.NewRequest("GET", "/api/auth/setup-status", nil)
	rrStatus := httptest.NewRecorder()
	handler.SetupStatus(rrStatus, reqStatus)
	if rrStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 for setup status, got %d", rrStatus.Code)
	}
	var statusResp struct {
		Data SetupStatusResponse `json:"data"`
	}
	_ = json.NewDecoder(rrStatus.Body).Decode(&statusResp)
	if !statusResp.Data.NeedsSetup {
		t.Errorf("expected needs_setup = true when 0 admins")
	}

	// 2. SetupSuperadmin with bad JSON
	reqBad := httptest.NewRequest("POST", "/api/auth/setup", bytes.NewReader([]byte("{bad")))
	reqBad = reqBad.WithContext(context.WithValue(reqBad.Context(), UserContextKey, db.User{ID: 99, IsActive: true}))
	rrBad := httptest.NewRecorder()
	handler.SetupSuperadmin(rrBad, reqBad)
	if rrBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in setup, got %d", rrBad.Code)
	}

	// 3. SetupSuperadmin with missing fields
	badSetup := SetupSuperadminRequest{Username: "superadmin", Password: ""}
	bodyBad, _ := json.Marshal(badSetup)
	reqMiss := httptest.NewRequest("POST", "/api/auth/setup", bytes.NewReader(bodyBad))
	reqMiss = reqMiss.WithContext(context.WithValue(reqMiss.Context(), UserContextKey, db.User{ID: 99, IsActive: true}))
	rrMiss := httptest.NewRecorder()
	handler.SetupSuperadmin(rrMiss, reqMiss)
	if rrMiss.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing fields in setup, got %d", rrMiss.Code)
	}

	// 4. SetupSuperadmin valid
	validSetup := SetupSuperadminRequest{
		Username: "superadmin",
		Password: "Password123!",
		FullName: "Super Admin",
		Email:    "admin@factory.lan",
	}
	bodyValid, _ := json.Marshal(validSetup)
	reqValid := httptest.NewRequest("POST", "/api/auth/setup", bytes.NewReader(bodyValid))
	reqValid = reqValid.WithContext(context.WithValue(reqValid.Context(), UserContextKey, db.User{ID: 99, IsActive: true}))
	rrValid := httptest.NewRecorder()
	handler.SetupSuperadmin(rrValid, reqValid)
	if rrValid.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid setup, got %d, body: %s", rrValid.Code, rrValid.Body.String())
	}

	// 5. SetupStatus when admin exists
	reqStatusAfter := httptest.NewRequest("GET", "/api/auth/setup-status", nil)
	rrStatusAfter := httptest.NewRecorder()
	handler.SetupStatus(rrStatusAfter, reqStatusAfter)
	_ = json.NewDecoder(rrStatusAfter.Body).Decode(&statusResp)
	if statusResp.Data.NeedsSetup {
		t.Errorf("expected needs_setup = false after setup")
	}

	// 6. SetupSuperadmin when admin already exists (403)
	reqDuplicate := httptest.NewRequest("POST", "/api/auth/setup", bytes.NewReader(bodyValid))
	reqDuplicate = reqDuplicate.WithContext(context.WithValue(reqDuplicate.Context(), UserContextKey, db.User{ID: 99, IsActive: true}))
	rrDuplicate := httptest.NewRecorder()
	handler.SetupSuperadmin(rrDuplicate, reqDuplicate)
	if rrDuplicate.Code != http.StatusForbidden {
		t.Errorf("expected 403 for duplicate superadmin setup, got %d", rrDuplicate.Code)
	}

	// 7. Login with inactive user (401)
	store.usersByName["inactive"] = db.User{
		ID:           99,
		Username:     "inactive",
		PasswordHash: sql.NullString{String: "$2a$10$validhashplaceholder", Valid: true},
		AuthSource:   "LOCAL",
		IsActive:     false,
	}
	loginInactive, _ := json.Marshal(LoginRequest{Username: "inactive", Password: "any"})
	reqInactive := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginInactive))
	rrInactive := httptest.NewRecorder()
	handler.Login(rrInactive, reqInactive)
	if rrInactive.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for inactive user login, got %d", rrInactive.Code)
	}

	// 8. Login with wrong password (401)
	loginWrong, _ := json.Marshal(LoginRequest{Username: "superadmin", Password: "wrongpassword"})
	reqWrong := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginWrong))
	rrWrong := httptest.NewRecorder()
	handler.Login(rrWrong, reqWrong)
	if rrWrong.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong password, got %d", rrWrong.Code)
	}
}

func TestHandler_LoginMoreBranchesAndADConfigErrors(t *testing.T) {
	store := newMockFullStore()
	tm := NewTokenManager([]byte("super-secret-jwt-key-1234567890123"))
	limiter := NewLoginLimiter(nil)
	cipher, _ := crypto.NewCipher("01234567890123456789012345678901")
	ticketMgr := NewTicketManager()
	handler := NewHandler(store, tm, limiter, cipher, nil, ticketMgr)

	// 1. Badge login
	badgeUser := db.User{
		ID:        55,
		Username:  "badge_user",
		BadgeCode: sql.NullString{String: "BADGE_55", Valid: true},
		Role:      RoleUser.String(),
		IsActive:  true,
	}
	store.users[badgeUser.ID] = badgeUser
	store.usersByBadge["BADGE_55"] = badgeUser

	bodyBadge, _ := json.Marshal(LoginRequest{BadgeCode: "BADGE_55"})
	reqBadge := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(bodyBadge))
	rrBadge := httptest.NewRecorder()
	handler.Login(rrBadge, reqBadge)
	if rrBadge.Code != http.StatusOK {
		t.Errorf("expected 200 for badge login, got %d", rrBadge.Code)
	}

	// 2. Missing username and badgeCode -> 400
	bodyEmpty, _ := json.Marshal(LoginRequest{})
	reqEmpty := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(bodyEmpty))
	rrEmpty := httptest.NewRecorder()
	handler.Login(rrEmpty, reqEmpty)
	if rrEmpty.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty login input, got %d", rrEmpty.Code)
	}

	// 3. Rate limiting and lockout
	clientIP := "192.168.1.50"
	accountKey := "locked_user"
	for range 6 {
		limiter.RecordFailure(clientIP, accountKey)
	}
	bodyLock, _ := json.Marshal(LoginRequest{Username: accountKey, Password: "any"})
	reqLock := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(bodyLock))
	reqLock.RemoteAddr = clientIP + ":12345"
	rrLock := httptest.NewRecorder()
	handler.Login(rrLock, reqLock)
	if rrLock.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429 for locked user, got %d", rrLock.Code)
	}

	// 4. ADConfigHandler tests
	mockLDAP := &MockLDAPClient{ErrToReturn: errors.New("ldap failed")}
	adHandler := NewADConfigHandler(store, cipher, mockLDAP)
	adminUser := db.User{ID: 1, Role: RoleAdmin.String(), IsActive: true}

	// UpdateADConfig unauth
	reqADUnauth := httptest.NewRequest("PUT", "/api/config/ad", bytes.NewReader([]byte("{}")))
	rrADUnauth := httptest.NewRecorder()
	adHandler.UpdateADConfig(rrADUnauth, reqADUnauth)
	if rrADUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauth update AD, got %d", rrADUnauth.Code)
	}

	// UpdateADConfig bad json
	reqADBad := httptest.NewRequest("PUT", "/api/config/ad", bytes.NewReader([]byte("{bad")))
	reqADBad = reqADBad.WithContext(context.WithValue(reqADBad.Context(), UserContextKey, adminUser))
	rrADBad := httptest.NewRecorder()
	adHandler.UpdateADConfig(rrADBad, reqADBad)
	if rrADBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json update AD, got %d", rrADBad.Code)
	}

	// UpdateADConfig with cipher == nil and BindPassword set -> 500
	noCipherHandler := NewADConfigHandler(store, nil, mockLDAP)
	adWithPass := UpdateADConfigRequest{BindPassword: "secret"}
	bodyPass, _ := json.Marshal(adWithPass)
	reqNoCipher := httptest.NewRequest("PUT", "/api/config/ad", bytes.NewReader(bodyPass))
	reqNoCipher = reqNoCipher.WithContext(context.WithValue(reqNoCipher.Context(), UserContextKey, adminUser))
	rrNoCipher := httptest.NewRecorder()
	noCipherHandler.UpdateADConfig(rrNoCipher, reqNoCipher)
	if rrNoCipher.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when cipher is nil and BindPassword is set, got %d", rrNoCipher.Code)
	}

	// TestADConfig bad JSON -> 400
	reqTestBad := httptest.NewRequest("POST", "/api/config/ad/test", bytes.NewReader([]byte("{bad")))
	rrTestBad := httptest.NewRecorder()
	adHandler.TestADConfig(rrTestBad, reqTestBad)
	if rrTestBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad json in test AD, got %d", rrTestBad.Code)
	}

	// TestADConfig when no server in request and store empty -> 400
	reqTestNoServer := httptest.NewRequest("POST", "/api/config/ad/test", bytes.NewReader([]byte("{}")))
	rrTestNoServer := httptest.NewRecorder()
	adHandler.TestADConfig(rrTestNoServer, reqTestNoServer)
	if rrTestNoServer.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for test AD with no server, got %d", rrTestNoServer.Code)
	}

	// TestADConfig with encrypted stored password and missing cipher -> explicit configuration error.
	store.adConfig = db.AdConfig{Server: "ad.lan", Port: 636, BindPassword: "encrypted"}
	noCipherTestHandler := NewADConfigHandler(store, nil, mockLDAP)
	reqMissingKey := httptest.NewRequest("POST", "/api/config/ad/test", bytes.NewReader([]byte("{}")))
	rrMissingKey := httptest.NewRecorder()
	noCipherTestHandler.TestADConfig(rrMissingKey, reqMissingKey)
	if rrMissingKey.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 when encryption key is missing, got %d", rrMissingKey.Code)
	}
	if !strings.Contains(rrMissingKey.Body.String(), string(i18n.ErrADEncryptionKeyMissing)) {
		t.Fatalf("expected encryption-key error, got %s", rrMissingKey.Body.String())
	}

	// TestADConfig failed connection -> 502
	testWithServer := UpdateADConfigRequest{Server: "ad.lan", Port: 636}
	bodyTestServer, _ := json.Marshal(testWithServer)
	reqTestFail := httptest.NewRequest("POST", "/api/config/ad/test", bytes.NewReader(bodyTestServer))
	rrTestFail := httptest.NewRecorder()
	adHandler.TestADConfig(rrTestFail, reqTestFail)
	if rrTestFail.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for invalid stored AD secret, got %d", rrTestFail.Code)
	}
}

func TestADTestErrorUsesLocalizedMessage(t *testing.T) {
	msg := i18n.Translate(i18n.LocaleEN, i18n.ErrADTestFailed, "search permission denied")
	if msg == string(i18n.ErrADTestFailed) || !strings.Contains(msg, "search permission denied") {
		t.Fatalf("expected localized AD test error, got %q", msg)
	}
}
