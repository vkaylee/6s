package database

import (
	"testing"
	"time"
)

func TestDefaultPoolConfig(t *testing.T) {
	cfg := DefaultPoolConfig()
	if cfg.MaxOpenConns != 25 {
		t.Errorf("expected MaxOpenConns 25, got %d", cfg.MaxOpenConns)
	}
	if cfg.MinIdleConns != 5 {
		t.Errorf("expected MinIdleConns 5, got %d", cfg.MinIdleConns)
	}
	if cfg.ConnMaxLifetime != 15*time.Minute {
		t.Errorf("expected ConnMaxLifetime 15m, got %v", cfg.ConnMaxLifetime)
	}
}
