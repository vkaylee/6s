package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/response"
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
