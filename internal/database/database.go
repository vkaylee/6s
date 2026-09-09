// Package database manages SQL connections and migrations.
package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver for database/sql
)

//go:embed migrations/*.up.sql
var migrationsFS embed.FS

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

// RunMigrations applies each embedded up migration once, in version order.
// Each migration and its tracking row commit atomically in one transaction;
// a changed applied migration fails rather than being silently re-executed.
func RunMigrations(ctx context.Context, db *sql.DB) (retErr error) { //nolint:gocognit // ordered migration and checksum validation stay explicit
	if db == nil {
		return fmt.Errorf("run migrations: nil database")
	}
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	type migration struct {
		version int64
		name    string
		body    []byte
	}
	migrations := make([]migration, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		parts := strings.SplitN(entry.Name(), "_", 2)
		if len(parts) != 2 {
			return fmt.Errorf("invalid migration filename %q", entry.Name())
		}
		version, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			return fmt.Errorf("invalid migration version %q: %w", entry.Name(), err)
		}
		body, err := migrationsFS.ReadFile(filepath.Join("migrations", entry.Name()))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		migrations = append(migrations, migration{version, entry.Name(), body})
	}
	sort.Slice(migrations, func(i, j int) bool { return migrations[i].version < migrations[j].version })
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer func() {
		if closeErr := conn.Close(); closeErr != nil && retErr == nil {
			retErr = fmt.Errorf("close migration connection: %w", closeErr)
		}
	}()
	if _, err := conn.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version BIGINT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_lock(hashtextextended('6s schema migrations', 0))`); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	defer func() {
		if _, unlockErr := conn.ExecContext(context.Background(), `SELECT pg_advisory_unlock(hashtextextended('6s schema migrations', 0))`); unlockErr != nil && retErr == nil {
			retErr = fmt.Errorf("release migration lock: %w", unlockErr)
		}
	}()
	for _, migration := range migrations {
		var checksum string
		err := conn.QueryRowContext(ctx, `SELECT checksum FROM schema_migrations WHERE version = $1`, migration.version).Scan(&checksum)
		if err == nil {
			if checksum != fmt.Sprintf("%x", sha256.Sum256(migration.body)) {
				return fmt.Errorf("migration %s checksum mismatch: applied content differs from embedded asset", migration.name)
			}
			continue
		}
		if err != sql.ErrNoRows {
			return fmt.Errorf("check migration %s: %w", migration.name, err)
		}
		tx, err := conn.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", migration.name, err)
		}
		rollback := func(cause error) error {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				return fmt.Errorf("%w; rollback migration %s: %v", cause, migration.name, rollbackErr)
			}
			return cause
		}
		if _, err = tx.ExecContext(ctx, string(migration.body)); err != nil {
			return rollback(fmt.Errorf("exec migration %s: %w", migration.name, err))
		}
		checksum = fmt.Sprintf("%x", sha256.Sum256(migration.body))
		if _, err = tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`, migration.version, migration.name, checksum); err != nil {
			return rollback(fmt.Errorf("record migration %s: %w", migration.name, err))
		}
		if err = tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", migration.name, err)
		}
	}
	return nil
}
