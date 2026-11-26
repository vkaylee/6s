package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"6s/internal/auth"
	"6s/internal/config"
)

func TestRouterPreservesPeerAddressForLoginLimiter(t *testing.T) {
	router := setupRouter(nil, &config.Config{TrustedProxies: "10.0.0.1", DevInsecure: true}, nil, nil)
	limiter := auth.NewLoginLimiter([]string{"10.0.0.1"})
	router.Get("/peer-test", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(limiter.GetClientIP(r)))
	})
	for _, tt := range []struct{ name, peer, forwarded, real, trueClient, want string }{
		{"direct spoofed headers", "192.0.2.10:1234", "203.0.113.5", "10.0.0.1", "10.0.0.1", "192.0.2.10"},
		{"untrusted proxy with trusted XFF", "198.51.100.2:4321", "10.0.0.1, 203.0.113.5", "127.0.0.1", "127.0.0.1", "198.51.100.2"},
		{"trusted proxy", "10.0.0.1:1234", "203.0.113.5", "198.51.100.5", "", "203.0.113.5"},
		{"trusted proxy without forwarded header", "10.0.0.1:1234", "", "203.0.113.5", "203.0.113.5", "10.0.0.1"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/peer-test", nil)
			req.RemoteAddr = tt.peer
			if tt.forwarded != "" {
				req.Header.Set("X-Forwarded-For", tt.forwarded)
			}
			if tt.real != "" {
				req.Header.Set("X-Real-IP", tt.real)
			}
			if tt.trueClient != "" {
				req.Header.Set("True-Client-IP", tt.trueClient)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if got := rec.Body.String(); got != tt.want {
				t.Fatalf("client IP = %q, want %q", got, tt.want)
			}
		})
	}
}
