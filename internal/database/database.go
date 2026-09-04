package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver for database/sql
)

// PoolConfig defines connection pool limits and lifetimes.
type PoolConfig struct {
	MaxOpenConns    int
	MinIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// DefaultPoolConfig returns standard database pool parameters according to SPEC.md.
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxOpenConns:    25,
		MinIdleConns:    5,
		ConnMaxLifetime: 15 * time.Minute,
		ConnMaxIdleTime: 5 * time.Minute,
	}
}

// Connect establishes a sql.DB connection pool using the pgx driver.
func Connect(ctx context.Context, dsn string, poolCfg PoolConfig) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("sql open: %w", err)
	}

	db.SetMaxOpenConns(poolCfg.MaxOpenConns)
	db.SetMaxIdleConns(poolCfg.MinIdleConns)
	db.SetConnMaxLifetime(poolCfg.ConnMaxLifetime)
	db.SetConnMaxIdleTime(poolCfg.ConnMaxIdleTime)

	// Check connectivity with a short timeout context
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	if err := db.PingContext(pingCtx); err != nil {
		// Do not fail hard immediately if network isn't ready during tests, but report error
		return db, fmt.Errorf("ping db: %w", err)
	}

	return db, nil
}
