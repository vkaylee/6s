package i18n_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/i18n"
)

func TestTranslate(t *testing.T) {
	if got := i18n.Translate("vi", i18n.ErrUnauthorized); got != "Yêu cầu đăng nhập" {
		t.Fatalf("expected vietnamese message, got %s", got)
	}
	if got := i18n.Translate("en", i18n.ErrUnauthorized); got != "Authentication required" {
		t.Fatalf("expected english message, got %s", got)
	}
	if got := i18n.Translate("zh", i18n.ErrUnauthorized); got != "请先登录" {
		t.Fatalf("expected chinese message, got %s", got)
	}
	if got := i18n.Translate("en", i18n.ErrInvalidInput, "email"); got != "Invalid input: email" {
		t.Fatalf("expected formatted message, got %s", got)
	}
	if got := i18n.Translate("zh", i18n.ErrInvalidInput, "email"); got != "输入数据无效: email" {
		t.Fatalf("expected chinese formatted message, got %s", got)
	}
	// Fallback to key when unknown
	if got := i18n.Translate("en", i18n.Key("unknown.key")); got != "unknown.key" {
		t.Fatalf("expected unknown.key fallback, got %s", got)
	}
}

func TestMiddleware(t *testing.T) {
	tests := []struct {
		name       string
		headerX    string
		headerAL   string
		queryLang  string
		wantLocale string
	}{
		{"X-Locale header en", "en", "", "", i18n.LocaleEN},
		{"X-Locale header vi", "vi", "", "", i18n.LocaleVI},
		{"X-Locale header zh", "zh", "", "", i18n.LocaleZH},
		{"Query param lang", "", "", "en", i18n.LocaleEN},
		{"Accept-Language en-US", "", "en-US,en;q=0.9", "", i18n.LocaleEN},
		{"Accept-Language vi-VN", "", "vi-VN,vi;q=0.9", "", i18n.LocaleVI},
		{"Accept-Language zh-CN", "", "zh-CN,zh;q=0.9", "", i18n.LocaleZH},
		{"Fallback default", "", "", "", i18n.DefaultLocale},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.headerX != "" {
				req.Header.Set("X-Locale", tt.headerX)
			}
			if tt.headerAL != "" {
				req.Header.Set("Accept-Language", tt.headerAL)
			}
			if tt.queryLang != "" {
				q := req.URL.Query()
				q.Set("lang", tt.queryLang)
				req.URL.RawQuery = q.Encode()
			}

			var captured string
			handler := i18n.Middleware(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				captured = i18n.FromContext(r.Context())
			}))

			handler.ServeHTTP(httptest.NewRecorder(), req)
			if captured != tt.wantLocale {
				t.Errorf("got locale %s, want %s", captured, tt.wantLocale)
			}
		})
	}
}
