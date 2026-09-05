package main

import (
	"6s/internal/config"
	"6s/internal/response"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	r := setupRouter(nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res response.Envelope
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	m, ok := res.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected data map, got %T", res.Data)
	}

	if m["status"] != "ok" {
		t.Errorf("expected status ok, got %v", m["status"])
	}
	if m["db"] != "disconnected" {
		t.Errorf("expected db disconnected without real db, got %v", m["db"])
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

	r := setupRouter(nil, cfg, nil, nil)

	// Test health HEAD method
	reqHead := httptest.NewRequest(http.MethodHead, "/api/health", nil)
	recHead := httptest.NewRecorder()
	r.ServeHTTP(recHead, reqHead)
	if recHead.Code != http.StatusOK {
		t.Fatalf("expected 200 for HEAD /api/health, got %d", recHead.Code)
	}
}
