package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJSONResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	JSON(rec, http.StatusOK, map[string]string{"name": "Line A1"})

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res Envelope
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	m, ok := res.Data.(map[string]any)
	if !ok || m["name"] != "Line A1" {
		t.Errorf("expected Line A1, got %v", res.Data)
	}
}

func TestPaginatedResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	Paginated(rec, http.StatusOK, []string{"a", "b"}, 1, 20, 2)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res Envelope
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	if res.Pagination == nil || res.Pagination.Total != 2 {
		t.Errorf("expected pagination total 2, got %v", res.Pagination)
	}
}

func TestErrorResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	Error(rec, http.StatusConflict, "ISSUE_CONFLICT", "Version mismatch", map[string]int{"current_version": 2})

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d", rec.Code)
	}

	var res Envelope
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	if res.Error == nil || res.Error.Code != "ISSUE_CONFLICT" {
		t.Errorf("expected code ISSUE_CONFLICT, got %v", res.Error)
	}
}
