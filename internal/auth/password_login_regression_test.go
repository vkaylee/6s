package auth

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"6s/internal/db"
)

func TestLoginPreservesPasswordWhitespace(t *testing.T) {
	store := newMockFullStore()
	password := " password with spaces "
	hash, err := HashPasswordWithParams(password, Argon2Params{
		Memory: 8 * 1024, Iterations: 1, Parallelism: 1, SaltLength: 16, KeyLength: 32,
	})
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	store.usersByName["space-user"] = db.User{
		ID: 1, Username: "space-user", AuthSource: "LOCAL",
		PasswordHash: sql.NullString{String: hash, Valid: true}, IsActive: true,
	}
	handler := NewHandler(store, NewTokenManager([]byte("super-secret-jwt-key-1234567890123")), NewLoginLimiter(nil), nil, nil)

	body, _ := json.Marshal(LoginRequest{Username: "space-user", Password: password})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.RemoteAddr = "10.20.0.1:1234"
	rr := httptest.NewRecorder()
	handler.Login(rr, req)
	if rr.Code != 200 {
		t.Fatalf("expected exact password including spaces to authenticate, got %d: %s", rr.Code, rr.Body.String())
	}

	body, _ = json.Marshal(LoginRequest{Username: "space-user", Password: "password with spaces"})
	req = httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.RemoteAddr = "10.20.0.2:1234"
	rr = httptest.NewRecorder()
	handler.Login(rr, req)
	if rr.Code != 401 {
		t.Fatalf("expected trimmed password to fail authentication, got %d: %s", rr.Code, rr.Body.String())
	}
}
