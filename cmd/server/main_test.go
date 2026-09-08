package main

import (
	"6s/internal/config"
	"6s/internal/crypto"
	"database/sql"
	"database/sql/driver"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type mockStmt struct{}

func (s *mockStmt) Close() error  { return nil }
func (s *mockStmt) NumInput() int { return -1 }
func (s *mockStmt) Exec(_ []driver.Value) (driver.Result, error) {
	return driver.RowsAffected(0), nil
}
func (s *mockStmt) Query(_ []driver.Value) (driver.Rows, error) { return &mockRows{}, nil }

type mockRows struct{}

func (r *mockRows) Columns() []string           { return []string{"id"} }
func (r *mockRows) Close() error                { return nil }
func (r *mockRows) Next(_ []driver.Value) error { return io.EOF }

type mockConn struct{}

func (m *mockConn) Prepare(_ string) (driver.Stmt, error) {
	return &mockStmt{}, nil
}
func (m *mockConn) Close() error {
	return nil
}
func (m *mockConn) Begin() (driver.Tx, error) {
	return nil, nil
}

type mockDriver struct{}

func (d *mockDriver) Open(_ string) (driver.Conn, error) {
	return &mockConn{}, nil
}

func init() {
	sql.Register("mock_sql_driver", &mockDriver{})
}

func TestHealthEndpoint(t *testing.T) {
	r := setupRouter(nil, nil, nil, nil)
	for _, path := range []string{"/api/health", "/api/ready"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		want := http.StatusOK
		if path == "/api/ready" {
			want = http.StatusServiceUnavailable
		}
		if rec.Code != want {
			t.Fatalf("GET %s: expected status %d, got %d", path, want, rec.Code)
		}
	}
}

func TestSPAStaticFallback(t *testing.T) {
	r := setupRouter(nil, nil, nil, nil)

	// Test root request returns HTML
	reqRoot := httptest.NewRequest(http.MethodGet, "/", nil)
	recRoot := httptest.NewRecorder()
	r.ServeHTTP(recRoot, reqRoot)

	if recRoot.Code != http.StatusOK {
		t.Fatalf("expected 200 for root, got %d", recRoot.Code)
	}
	if !strings.Contains(recRoot.Body.String(), "<!doctype html>") && !strings.Contains(recRoot.Body.String(), "<div id=\"root\">") {
		t.Errorf("expected HTML index file, got: %s", recRoot.Body.String())
	}

	// Test SPA client-side route fallback returns index.html
	reqSPA := httptest.NewRequest(http.MethodGet, "/issues/123", nil)
	recSPA := httptest.NewRecorder()
	r.ServeHTTP(recSPA, reqSPA)

	if recSPA.Code != http.StatusOK {
		t.Fatalf("expected 200 for SPA route, got %d", recSPA.Code)
	}

	// Test CA cert endpoint (safe 404 when file not present)
	reqCert := httptest.NewRequest(http.MethodGet, "/cert/ca.crt", nil)
	recCert := httptest.NewRecorder()
	r.ServeHTTP(recCert, reqCert)
	if recCert.Code != http.StatusOK && recCert.Code != http.StatusNotFound {
		t.Errorf("expected 200 or 404 for cert, got %d", recCert.Code)
	}
}

func TestRouter_ConfiguredSetup(t *testing.T) {
	tempDir := t.TempDir()
	cfg := &config.Config{
		Port:           "8080",
		DataDir:        tempDir,
		JWTSecret:      "test-secret-at-least-32-bytes-long-key!",
		TrustedProxies: "127.0.0.1",
	}
	mockDB, err := sql.Open("mock_sql_driver", "test")
	if err != nil {
		t.Fatalf("failed to open mock db: %v", err)
	}
	defer mockDB.Close()

	enc, err := crypto.NewEncryptor("0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("failed to create cipher: %v", err)
	}

	r := setupRouter(mockDB, cfg, enc, nil)

	// Test health HEAD method
	reqHead := httptest.NewRequest(http.MethodHead, "/api/health", nil)
	recHead := httptest.NewRecorder()
	r.ServeHTTP(recHead, reqHead)
	if recHead.Code != http.StatusOK {
		t.Fatalf("expected 200 for HEAD /api/health, got %d", recHead.Code)
	}

	// Test public route dispatches properly
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`))
	recLogin := httptest.NewRecorder()
	r.ServeHTTP(recLogin, reqLogin)
	if recLogin.Code == http.StatusNotFound {
		t.Errorf("expected route /api/auth/login to be registered, got 404")
	}
}
