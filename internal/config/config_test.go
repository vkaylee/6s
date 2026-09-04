package config

import (
	"os"
	"testing"
)

func TestConfigLoadDefaults(t *testing.T) {
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
	os.Setenv("SERVER_PORT", "7070")
	defer os.Unsetenv("SERVER_PORT")

	cfg, err := Load([]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != "7070" {
		t.Errorf("expected port 7070, got %s", cfg.Port)
	}
}
