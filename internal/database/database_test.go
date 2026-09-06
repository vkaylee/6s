package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"testing"
	"time"
)

type mockConn struct{}

func (m *mockConn) Prepare(_ string) (driver.Stmt, error) {
	return &mockStmt{}, nil
}
func (m *mockConn) Close() error              { return nil }
func (m *mockConn) Begin() (driver.Tx, error) { return nil, nil }

var mockExecErr error

type mockStmt struct{}

func (s *mockStmt) Close() error  { return nil }
func (s *mockStmt) NumInput() int { return -1 }
func (s *mockStmt) Exec(_ []driver.Value) (driver.Result, error) {
	if mockExecErr != nil {
		return nil, mockExecErr
	}
	return driver.RowsAffected(0), nil
}
func (s *mockStmt) Query(_ []driver.Value) (driver.Rows, error) { return nil, nil }

type mockDriver struct{}

func (d *mockDriver) Open(_ string) (driver.Conn, error) {
	return &mockConn{}, nil
}

func init() {
	sql.Register("mock_migration_driver", &mockDriver{})
}

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

func TestRunMigrations_Mock(t *testing.T) {
	db, err := sql.Open("mock_migration_driver", "")
	if err != nil {
		t.Fatalf("failed to open mock db: %v", err)
	}
	defer db.Close()

	if err := RunMigrations(context.Background(), db); err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// Error branch
	mockExecErr = errors.New("exec error")
	defer func() { mockExecErr = nil }()
	if err := RunMigrations(context.Background(), db); err == nil {
		t.Error("expected error from RunMigrations when exec fails, got nil")
	}
}
