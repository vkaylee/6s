package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/apperror"
	"6s/internal/i18n"
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

func TestRenderError(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)

	appErr := apperror.Conflict("ISSUE_CONFLICT", i18n.ErrConflict).WithDetails(map[string]int{"current_version": 2})
	RenderError(rec, req, appErr)

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

func TestAppErrorResponse(t *testing.T) {
	// Test English
	reqEN := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	reqEN.Header.Set("X-Locale", "en")
	recEN := httptest.NewRecorder()

	appErr := apperror.Unauthorized(i18n.ErrUnauthorized)
	AppError(recEN, reqEN.WithContext(i18n.WithLocale(reqEN.Context(), "en")), appErr)

	if recEN.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", recEN.Code)
	}

	var resEN Envelope
	if err := json.NewDecoder(recEN.Body).Decode(&resEN); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}

	if resEN.Error == nil || resEN.Error.Message != "Authentication required" {
		t.Errorf("expected English message, got %v", resEN.Error)
	}
	if resEN.Error.Key != string(i18n.ErrUnauthorized) {
		t.Errorf("expected Key %s, got %s", i18n.ErrUnauthorized, resEN.Error.Key)
	}

	// Test Vietnamese default
	reqVI := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	recVI := httptest.NewRecorder()
	AppError(recVI, reqVI, appErr)

	var resVI Envelope
	if err := json.NewDecoder(recVI.Body).Decode(&resVI); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if resVI.Error == nil || resVI.Error.Message != "Yêu cầu đăng nhập" {
		t.Errorf("expected Vietnamese message, got %v", resVI.Error)
	}
}
