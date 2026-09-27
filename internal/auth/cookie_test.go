package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSetSessionCookiesFlagsAndPaths(t *testing.T) {
	recorder := httptest.NewRecorder()
	if err := setSessionCookies(recorder, "access-value", "refresh-value", true); err != nil {
		t.Fatalf("set session cookies: %v", err)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 3 {
		t.Fatalf("expected 3 cookies, got %d", len(cookies))
	}
	want := map[string]struct {
		path     string
		httpOnly bool
		secure   bool
	}{
		AccessCookieName:  {path: "/api", httpOnly: true, secure: true},
		RefreshCookieName: {path: "/api/auth", httpOnly: true, secure: true},
		CSRFCookieName:    {path: "/", httpOnly: false, secure: true},
	}
	for _, cookie := range cookies {
		expected, ok := want[cookie.Name]
		if !ok {
			t.Fatalf("unexpected cookie %q", cookie.Name)
		}
		if cookie.Path != expected.path || cookie.HttpOnly != expected.httpOnly || cookie.Secure != expected.secure {
			t.Errorf("cookie %q flags/path = path %q httpOnly %v secure %v", cookie.Name, cookie.Path, cookie.HttpOnly, cookie.Secure)
		}
		if cookie.SameSite != http.SameSiteStrictMode {
			t.Errorf("cookie %q SameSite = %v, want Strict", cookie.Name, cookie.SameSite)
		}
	}
}

func TestSetSessionCookiesDevelopmentOmitsSecure(t *testing.T) {
	recorder := httptest.NewRecorder()
	if err := setSessionCookies(recorder, "access", "refresh", false); err != nil {
		t.Fatalf("set development cookies: %v", err)
	}
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Secure {
			t.Errorf("development cookie %q unexpectedly Secure", cookie.Name)
		}
	}
}

func TestClearSessionCookies(t *testing.T) {
	recorder := httptest.NewRecorder()
	clearSessionCookies(recorder, true)
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.MaxAge >= 0 || cookie.Value != "" || !cookie.Secure {
			t.Errorf("cookie %q not cleared securely: %+v", cookie.Name, cookie)
		}
	}
}

func TestCSRFMiddlewareDoubleSubmitAndSameOrigin(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	handler := NewCSRFMiddleware(false)(next)

	getReq := httptest.NewRequest(http.MethodGet, "http://example.test/api/auth/setup-status", nil)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)
	csrfCookie := findCookie(t, getRec.Result().Cookies(), CSRFCookieName)

	missingHeader := httptest.NewRequest(http.MethodPost, "http://example.test/api/auth/login", nil)
	missingHeader.AddCookie(csrfCookie)
	missingRec := httptest.NewRecorder()
	handler.ServeHTTP(missingRec, missingHeader)
	if missingRec.Code != http.StatusForbidden {
		t.Fatalf("missing CSRF header status = %d, want 403", missingRec.Code)
	}

	mismatch := httptest.NewRequest(http.MethodPost, "http://example.test/api/auth/login", nil)
	mismatch.AddCookie(csrfCookie)
	mismatch.Header.Set("X-CSRF-Token", "wrong")
	mismatch.Header.Set("Origin", "http://example.test")
	mismatchRec := httptest.NewRecorder()
	handler.ServeHTTP(mismatchRec, mismatch)
	if mismatchRec.Code != http.StatusForbidden {
		t.Fatalf("mismatched CSRF status = %d, want 403", mismatchRec.Code)
	}

	crossOrigin := httptest.NewRequest(http.MethodPost, "http://example.test/api/auth/login", nil)
	crossOrigin.AddCookie(csrfCookie)
	crossOrigin.Header.Set("X-CSRF-Token", csrfCookie.Value)
	crossOrigin.Header.Set("Origin", "http://attacker.test")
	crossOriginRec := httptest.NewRecorder()
	handler.ServeHTTP(crossOriginRec, crossOrigin)
	if crossOriginRec.Code != http.StatusForbidden {
		t.Fatalf("cross-origin status = %d, want 403", crossOriginRec.Code)
	}

	valid := httptest.NewRequest(http.MethodPost, "http://example.test/api/auth/login", nil)
	valid.AddCookie(csrfCookie)
	valid.Header.Set("X-CSRF-Token", csrfCookie.Value)
	valid.Header.Set("Origin", "http://example.test")
	validRec := httptest.NewRecorder()
	handler.ServeHTTP(validRec, valid)
	if validRec.Code != http.StatusNoContent {
		t.Fatalf("valid CSRF status = %d, want 204", validRec.Code)
	}
}

func findCookie(t *testing.T, cookies []*http.Cookie, name string) *http.Cookie {
	t.Helper()
	for _, cookie := range cookies {
		if cookie.Name == name {
			return cookie
		}
	}
	t.Fatalf("missing %s cookie in response: %s", name, strings.Join(cookieNames(cookies), ", "))
	return nil
}

func cookieNames(cookies []*http.Cookie) []string {
	names := make([]string, 0, len(cookies))
	for _, cookie := range cookies {
		names = append(names, cookie.Name)
	}
	return names
}
