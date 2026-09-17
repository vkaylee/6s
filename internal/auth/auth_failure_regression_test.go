package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"testing"

	"6s/internal/db"
)

type failingAuthStore struct{ *mockFullStore }

func (s *failingAuthStore) GetADConfig(context.Context) (db.AdConfig, error) {
	return db.AdConfig{}, errors.New("database unavailable")
}

func TestLoginOperationalFailureDoesNotChargeAccountLockout(t *testing.T) {
	store := &failingAuthStore{newMockFullStore()}
	h := NewHandler(store, NewTokenManager([]byte("super-secret-jwt-key-1234567890123")), NewLoginLimiter(nil), nil, nil)
	for i := range 10 {
		body, _ := json.Marshal(LoginRequest{Username: "ad-user", Password: "secret"})
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		req.RemoteAddr = fmt.Sprintf("10.0.0.%d:1234", i+1)
		rr := httptest.NewRecorder()
		h.Login(rr, req)
		if rr.Code != 500 {
			t.Fatalf("expected operational 500 on attempt %d, got %d", i+1, rr.Code)
		}
	}
	allowedIP, allowedAccount, _ := h.limiter.CheckAllowed("", "ad-user")
	if !allowedIP || !allowedAccount {
		t.Fatal("operational failures must not lock the account")
	}
}

func TestLoginInvalidCredentialsChargesAccountLockout(t *testing.T) {
	store := newMockFullStore()
	hash, err := HashPassword("correct")
	if err != nil {
		t.Fatal(err)
	}
	store.usersByName["local"] = db.User{ID: 1, Username: "local", AuthSource: "LOCAL", PasswordHash: sql.NullString{String: hash, Valid: true}, IsActive: true}
	h := NewHandler(store, NewTokenManager([]byte("super-secret-jwt-key-1234567890123")), NewLoginLimiter(nil), nil, nil)
	for i := range 10 {
		body, _ := json.Marshal(LoginRequest{Username: "local", Password: "wrong"})
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		req.RemoteAddr = fmt.Sprintf("10.0.1.%d:1234", i+1)
		rr := httptest.NewRecorder()
		h.Login(rr, req)
	}
	_, allowed, _ := h.limiter.CheckAllowed("", "local")
	if allowed {
		t.Fatal("invalid credentials must lock the account after repeated failures")
	}
}

func TestLoginDecryptFailureIsOperational(t *testing.T) {
	store := newMockFullStore()
	store.adConfig = db.AdConfig{IsEnabled: true, Server: "ad.factory.lan", Port: 636, BindPassword: "not-valid-ciphertext"}
	h := NewHandler(store, NewTokenManager([]byte("super-secret-jwt-key-1234567890123")), NewLoginLimiter(nil), nil, nil)
	body, _ := json.Marshal(LoginRequest{Username: "ad-user", Password: "secret"})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	h.Login(rr, req)
	if rr.Code != 500 {
		t.Fatalf("expected decrypt failure 500, got %d", rr.Code)
	}
	_, allowed, _ := h.limiter.CheckAllowed("", "ad-user")
	if !allowed {
		t.Fatal("decrypt failure must not charge account lockout")
	}
}

type failingJITStore struct{ *mockFullStore }

func (s *failingJITStore) CreateUserJIT(context.Context, db.CreateUserJITParams) (db.User, error) {
	return db.User{}, errors.New("JIT persistence unavailable")
}

func TestLoginJITPersistenceFailureDoesNotChargeAccountLockout(t *testing.T) {
	store := &failingJITStore{newMockFullStore()}
	store.adConfig = db.AdConfig{IsEnabled: true, Server: "ad.factory.lan", Port: 636}
	handler := NewHandler(store, NewTokenManager([]byte("super-secret-jwt-key-1234567890123")), NewLoginLimiter(nil), nil, &MockLDAPClient{UserToReturn: &LDAPUser{Username: "ad-user", DN: "CN=AD User,DC=factory,DC=lan", FullName: "AD User"}})
	for i := range 10 {
		body, _ := json.Marshal(LoginRequest{Username: "ad-user", Password: "secret"})
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		req.RemoteAddr = fmt.Sprintf("10.0.2.%d:1234", i+1)
		rr := httptest.NewRecorder()
		handler.Login(rr, req)
		if rr.Code != 500 {
			t.Fatalf("expected JIT operational 500 on attempt %d, got %d", i+1, rr.Code)
		}
	}
	_, allowed, _ := handler.limiter.CheckAllowed("", "ad-user")
	if !allowed {
		t.Fatal("JIT persistence failures must not lock the account")
	}
}

func TestLoginLDAPUnreachableDoesNotChargeAccountLockout(t *testing.T) {
	store := newMockFullStore()
	store.adConfig = db.AdConfig{IsEnabled: true, Server: "ad.factory.lan", Port: 636}
	handler := NewHandler(
		store,
		NewTokenManager([]byte("super-secret-jwt-key-1234567890123")),
		NewLoginLimiter(nil),
		nil,
		&MockLDAPClient{ErrToReturn: ErrLDAPUnreachable},
	)
	for i := range 10 {
		body, _ := json.Marshal(LoginRequest{Username: "ad-user", Password: "secret"})
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		req.RemoteAddr = fmt.Sprintf("10.0.3.%d:1234", i+1)
		rr := httptest.NewRecorder()
		handler.Login(rr, req)
		if rr.Code != 500 {
			t.Fatalf("expected LDAP outage 500 on attempt %d, got %d", i+1, rr.Code)
		}
	}
	_, allowed, _ := handler.limiter.CheckAllowed("", "ad-user")
	if !allowed {
		t.Fatal("LDAP outage must not lock the account")
	}
}

func TestLoginLDAPRejectionChargesAccountLockout(t *testing.T) {
	store := newMockFullStore()
	store.adConfig = db.AdConfig{IsEnabled: true, Server: "ad.factory.lan", Port: 636}
	handler := NewHandler(
		store,
		NewTokenManager([]byte("super-secret-jwt-key-1234567890123")),
		NewLoginLimiter(nil),
		nil,
		&MockLDAPClient{ErrToReturn: ErrLDAPInvalidCredentials},
	)
	for i := range 10 {
		body, _ := json.Marshal(LoginRequest{Username: "ad-user", Password: "wrong"})
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		req.RemoteAddr = fmt.Sprintf("10.0.4.%d:1234", i+1)
		rr := httptest.NewRecorder()
		handler.Login(rr, req)
		if rr.Code != 401 {
			t.Fatalf("expected 401 on attempt %d, got %d", i+1, rr.Code)
		}
	}
	_, allowed, _ := handler.limiter.CheckAllowed("", "ad-user")
	if allowed {
		t.Fatal("repeated AD password rejections must lock the account")
	}
}
