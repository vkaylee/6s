package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/db"
)

type mockUserGetter struct {
	user db.User
	err  error
}

func (m *mockUserGetter) GetUserByID(_ context.Context, _ int64) (db.User, error) {
	if m.err != nil {
		return db.User{}, m.err
	}
	return m.user, nil
}

func TestMiddleware_Authenticate(t *testing.T) {
	secret := []byte("secret-key-12345678901234567890")
	tm := NewTokenManager(secret)
	getter := &mockUserGetter{
		user: db.User{
			ID:       1,
			Username: "admin",
			Role:     "ADMIN",
			IsActive: true,
		},
	}
	mw := NewMiddleware(tm, getter)

	handler := mw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := GetUserFromContext(r.Context())
		if !ok {
			t.Fatal("expected user in context")
		}
		if u.Username != "admin" {
			t.Errorf("expected username admin, got %s", u.Username)
		}
		w.WriteHeader(http.StatusOK)
	}))

	// 1. Missing header
	req := httptest.NewRequest("GET", "/protected", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for missing header, got %d", rr.Code)
	}

	// 2. Valid token
	token, _, _ := tm.GenerateAccessToken(1)
	reqValid := httptest.NewRequest("GET", "/protected", nil)
	reqValid.Header.Set("Authorization", "Bearer "+token)
	rrValid := httptest.NewRecorder()
	handler.ServeHTTP(rrValid, reqValid)
	if rrValid.Code != http.StatusOK {
		t.Errorf("expected 200 for valid token, got %d", rrValid.Code)
	}

	// 3. Inactive user
	getter.user.IsActive = false
	rrInactive := httptest.NewRecorder()
	handler.ServeHTTP(rrInactive, reqValid)
	if rrInactive.Code != http.StatusForbidden {
		t.Errorf("expected 403 for inactive user, got %d", rrInactive.Code)
	}
}

func TestRequireRole(t *testing.T) {
	adminUser := db.User{ID: 1, Role: "ADMIN", IsActive: true}
	workerUser := db.User{ID: 2, Role: "USER", IsActive: true}

	protected := RequireRole("ADMIN", "SAFETY_OFFICER")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Admin access
	reqAdmin := httptest.NewRequest("GET", "/admin", nil)
	ctxAdmin := context.WithValue(reqAdmin.Context(), UserContextKey, adminUser)
	rrAdmin := httptest.NewRecorder()
	protected.ServeHTTP(rrAdmin, reqAdmin.WithContext(ctxAdmin))
	if rrAdmin.Code != http.StatusOK {
		t.Errorf("expected 200 for admin, got %d", rrAdmin.Code)
	}

	// Worker access
	reqWorker := httptest.NewRequest("GET", "/admin", nil)
	ctxWorker := context.WithValue(reqWorker.Context(), UserContextKey, workerUser)
	rrWorker := httptest.NewRecorder()
	protected.ServeHTTP(rrWorker, reqWorker.WithContext(ctxWorker))
	if rrWorker.Code != http.StatusForbidden {
		t.Errorf("expected 403 for worker on admin route, got %d", rrWorker.Code)
	}
}
