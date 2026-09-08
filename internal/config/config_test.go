package config

import (
	"os"
	"strings"
	"testing"
)

func TestConfigLoadDefaults(t *testing.T) {
	t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	cfg, err := Load([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != "8080" {
		t.Errorf("expected port 8080, got %s", cfg.Port)
	}
	if cfg.DataDir != "./data" {
		t.Errorf("expected dataDir ./data, got %s", cfg.DataDir)
	}
}

func TestConfigLoadFlags(t *testing.T) {
	t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	args := []string{"-port", "9090", "-data-dir", "/tmp/6s", "-encryption-key", "my-key"}
	cfg, err := Load(args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != "9090" {
		t.Errorf("expected port 9090, got %s", cfg.Port)
	}
	if cfg.DataDir != "/tmp/6s" {
		t.Errorf("expected dataDir /tmp/6s, got %s", cfg.DataDir)
	}
	if cfg.EncryptionKey != "my-key" {
		t.Errorf("expected key my-key, got %s", cfg.EncryptionKey)
	}
}

func TestConfigLoadEnv(t *testing.T) {
	t.Setenv("SERVER_PORT", "7070")
	t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")

	cfg, err := Load([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != "7070" {
		t.Errorf("expected port 7070, got %s", cfg.Port)
	}
}

func TestConfigLoadMissingRequiredFails(t *testing.T) {
	for _, tc := range []struct {
		name    string
		setEnv  func(t *testing.T)
		wantSub string
	}{
		{
			name:    "missing DB_DSN",
			setEnv:  func(t *testing.T) { unsetenv(t, "DB_DSN") },
			wantSub: "DB_DSN is required",
		},
		{
			name: "missing JWT_SECRET",
			setEnv: func(t *testing.T) {
				t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
				unsetenv(t, "JWT_SECRET")
			},
			wantSub: "JWT_SECRET is required",
		},
		{
			name: "short JWT_SECRET",
			setEnv: func(t *testing.T) {
				t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
				t.Setenv("JWT_SECRET", "short")
			},
			wantSub: "at least 32 bytes",
		},
		{
			name: "plaintext DSN",
			setEnv: func(t *testing.T) {
				t.Setenv("DB_DSN", "postgres://postgres:postgres@localhost:5432/6s_db?sslmode=disable")
				t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
			},
			wantSub: "plaintext Postgres",
		},
		{
			name: "partial TLS pair",
			setEnv: func(t *testing.T) {
				t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
				t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
				t.Setenv("TLS_CERT", "/certs/server.crt")
			},
			wantSub: "TLS_CERT and TLS_KEY",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tc.setEnv(t)
			_, err := Load([]string{})
			if err == nil {
				t.Fatalf("expected error for %s", tc.name)
			}
			if !strings.Contains(err.Error(), tc.wantSub) {
				t.Errorf("expected error containing %q, got %q", tc.wantSub, err.Error())
			}
		})
	}
}

func TestConfigDevInsecureAllowsLocalSetup(t *testing.T) {
	t.Setenv("DB_DSN", "postgres://postgres:postgres@localhost:5432/6s_db?sslmode=disable")
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("DEV_INSECURE", "1")

	cfg, err := Load([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.DevInsecure {
		t.Error("expected DevInsecure to be true")
	}
}

func TestConfigPlainHTTPAllowedWithoutTLSFlags(t *testing.T) {
	// TLS is optional at the app layer (a reverse proxy such as Caddy may
	// terminate it); absent flags with valid DSN/secret must load cleanly.
	t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")

	cfg, err := Load([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.TLSCert != "" || cfg.TLSKey != "" {
		t.Errorf("expected no TLS paths, got cert=%q key=%q", cfg.TLSCert, cfg.TLSKey)
	}
}

func TestConfigJWTSecretMinimumLengthBoundary(t *testing.T) {
	t.Setenv("DB_DSN", "postgres://user:secret@localhost:5432/6s_db?sslmode=require")
	t.Setenv("JWT_SECRET", strings.Repeat("k", MinJWTSecretLen))

	if _, err := Load([]string{}); err != nil {
		t.Fatalf("secret of exactly %d bytes should be accepted: %v", MinJWTSecretLen, err)
	}
}

func TestIsPlaintextPostgresDSN(t *testing.T) {
	for _, tc := range []struct {
		dsn  string
		want bool
	}{
		{"postgres://u:p@h:5432/db?sslmode=disable", true},
		{"postgres://u:p@h:5432/db", true},
		{"postgres://u:p@h:5432/db?sslmode=prefer", true},
		{"postgres://u:p@h:5432/db?sslmode=allow", true},
		{"postgres://u:p@h:5432/db?sslmode=require", false},
		{"postgres://u:p@h:5432/db?sslmode=verify-full", false},
		{"postgresql://u:p@h:5432/db?sslmode=verify-ca", false},
		{"host=h user=u password=p dbname=db sslmode=require", false},
	} {
		if got := isPlaintextPostgresDSN(tc.dsn); got != tc.want {
			t.Errorf("isPlaintextPostgresDSN(%q) = %v, want %v", tc.dsn, got, tc.want)
		}
	}
}

// unsetenv removes an env var for the duration of the test.
func unsetenv(t *testing.T, key string) {
	t.Helper()
	val, had := os.LookupEnv(key)
	os.Unsetenv(key)
	t.Cleanup(func() {
		if had {
			os.Setenv(key, val)
		}
	})
}
