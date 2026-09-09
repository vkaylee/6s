package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
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
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	cfg := DefaultPoolConfig()
	// A canceled context makes PingContext fail before any network I/O.
	db, err := Connect(ctx, "postgres://invalid:user@127.0.0.1:54329/nonexistent?sslmode=disable", cfg)
	if db != nil {
		defer db.Close()
	}
	if err == nil {
		t.Fatal("expected Connect to return an error for a canceled context")
	}
}

func TestRunMigrations_NilDB(t *testing.T) {
	if err := RunMigrations(context.Background(), nil); err == nil {
		t.Fatal("expected nil database error")
	}
}
