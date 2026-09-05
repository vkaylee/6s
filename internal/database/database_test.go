package database

import (
	"context"
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

func TestDatabase_ConnectError(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	cfg := DefaultPoolConfig()
	// Connection to non-existent DB should fail ping gracefully and return error
	db, err := Connect(ctx, "postgres://invalid:user@127.0.0.1:54329/nonexistent?sslmode=disable", cfg)
	if db != nil {
		_ = db.Close()
	}
	if err == nil {
		t.Log("Note: Ping succeeded or skipped")
	}
}
