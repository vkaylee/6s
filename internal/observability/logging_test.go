package observability

import (
	"strings"
	"testing"
)

func TestRedactSensitiveCredentials(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "password key-value",
			input:    "database unavailable: password=top-secret",
			expected: "database unavailable: password=[REDACTED]",
		},
		{
			name:     "secret key-value colon",
			input:    "app failed with secret: my-secret-token",
			expected: "app failed with secret: [REDACTED]",
		},
		{
			name:     "postgres DSN credentials",
			input:    "failed to connect to postgres://user:supersecret@localhost:5432/db",
			expected: "failed to connect to postgres://user:[REDACTED]@localhost:5432/db",
		},
		{
			name:     "query string token",
			input:    "https://api.example.com/webhook?token=xyz123&action=sync",
			expected: "https://api.example.com/webhook?token=[REDACTED]&action=sync",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := Redact(tc.input).(string)
			if !ok {
				t.Fatalf("expected string output")
			}
			if got != tc.expected {
				t.Errorf("Redact(%q) = %q; want %q", tc.input, got, tc.expected)
			}
			if strings.Contains(got, "top-secret") || strings.Contains(got, "supersecret") || strings.Contains(got, "my-secret-token") {
				t.Errorf("Redacted string leaked secret: %q", got)
			}
		})
	}
}
