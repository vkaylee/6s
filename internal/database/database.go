// Package database manages SQL connections and migrations.
package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	// Driver registration for database/sql.
	_ "github.com/jackc/pgx/v5/stdlib"
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

// DefaultPoolConfig provides production connection pool defaults.
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxOpenConns:    25,
		MinIdleConns:    5,
		ConnMaxLifetime: 15 * time.Minute,
		ConnMaxIdleTime: 5 * time.Minute,
	}
}

// Connect opens and validates a PostgreSQL connection pool.
func Connect(ctx context.Context, dsn string, poolCfg PoolConfig) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("sql open: %w", err)
	}
	db.SetMaxOpenConns(poolCfg.MaxOpenConns)
	db.SetMaxIdleConns(poolCfg.MinIdleConns)
	db.SetConnMaxLifetime(poolCfg.ConnMaxLifetime)
	db.SetConnMaxIdleTime(poolCfg.ConnMaxIdleTime)

	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return db, nil
}

// MigrationInfo is the externally visible state of one embedded migration.
type MigrationInfo struct {
	Version  int64
	Name     string
	Checksum string
	Applied  bool
}

type migrationAsset struct {
	version  int64
	name     string
	checksum string
	body     []byte
}

type migrationTimeouts struct {
	lock      time.Duration
	statement time.Duration
	overall   time.Duration
}

var migrationNameRE = regexp.MustCompile(`^[0-9]{6}_[a-z0-9][a-z0-9_-]*\.up\.sql$`)

func migrationTimeoutConfig() (migrationTimeouts, error) {
	parse := func(key string, fallback time.Duration) (time.Duration, error) {
		value := os.Getenv(key)
		if value == "" {
			return fallback, nil
		}
		parsed, err := time.ParseDuration(value)
		if err != nil || parsed <= 0 {
			return 0, fmt.Errorf("invalid %s", key)
		}
		return parsed, nil
	}

	lock, err := parse("MIGRATION_LOCK_TIMEOUT", 30*time.Second)
	if err != nil {
		return migrationTimeouts{}, err
	}
	statement, err := parse("MIGRATION_STATEMENT_TIMEOUT", 5*time.Minute)
	if err != nil {
		return migrationTimeouts{}, err
	}
	overall, err := parse("MIGRATION_TIMEOUT", 10*time.Minute)
	if err != nil {
		return migrationTimeouts{}, err
	}
	return migrationTimeouts{lock: lock, statement: statement, overall: overall}, nil
}

func loadManifest() ([]migrationAsset, error) {
	return loadManifestFromFS(migrationsFS)
}

func loadManifestFromFS(source fs.FS) ([]migrationAsset, error) {
	entries, err := fs.ReadDir(source, "migrations")
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}

	manifest := make([]migrationAsset, 0, len(entries))
	versions := make(map[int64]string, len(entries))
	names := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		if !migrationNameRE.MatchString(entry.Name()) {
			return nil, fmt.Errorf("invalid migration filename %q", entry.Name())
		}
		parts := strings.SplitN(entry.Name(), "_", 2)
		version, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || version <= 0 {
			return nil, fmt.Errorf("invalid migration version %q", entry.Name())
		}
		if previous, exists := versions[version]; exists {
			return nil, fmt.Errorf("duplicate migration version %d (%s and %s)", version, previous, entry.Name())
		}
		if _, exists := names[entry.Name()]; exists {
			return nil, fmt.Errorf("duplicate migration name %q", entry.Name())
		}
		body, err := fs.ReadFile(source, filepath.Join("migrations", entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		versions[version] = entry.Name()
		names[entry.Name()] = struct{}{}
		manifest = append(manifest, migrationAsset{
			version:  version,
			name:     entry.Name(),
			checksum: fmt.Sprintf("%x", sha256.Sum256(body)),
			body:     body,
		})
	}
	sort.Slice(manifest, func(i, j int) bool { return manifest[i].version < manifest[j].version })
	return manifest, nil
}

func migrationLedgerDDL() string {
	return `CREATE TABLE IF NOT EXISTS schema_migrations (
		version BIGINT PRIMARY KEY,
		name TEXT NOT NULL,
		checksum TEXT NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`
}

func ledgerExists(ctx context.Context, conn *sql.Conn) (bool, error) {
	var relation *string
	if err := conn.QueryRowContext(ctx, `SELECT to_regclass('public.schema_migrations')`).Scan(&relation); err != nil {
		return false, err
	}
	return relation != nil, nil
}

func readLedger(ctx context.Context, conn *sql.Conn) (map[int64]MigrationInfo, error) {
	rows, err := conn.QueryContext(ctx, `SELECT version, name, checksum FROM public.schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = rows.Close()
	}()

	ledger := make(map[int64]MigrationInfo)
	for rows.Next() {
		var item MigrationInfo
		if err := rows.Scan(&item.Version, &item.Name, &item.Checksum); err != nil {
			return nil, err
		}
		if _, exists := ledger[item.Version]; exists {
			return nil, fmt.Errorf("schema_migrations contains duplicate version %d", item.Version)
		}
		ledger[item.Version] = item
	}
	return ledger, rows.Err()
}

func validateLedger(manifest []migrationAsset, ledger map[int64]MigrationInfo) error {
	byVersion := make(map[int64]migrationAsset, len(manifest))
	for _, asset := range manifest {
		byVersion[asset.version] = asset
	}

	var highest int64
	for version, applied := range ledger {
		asset, exists := byVersion[version]
		if !exists {
			return fmt.Errorf("ledger contains unknown migration version %d", version)
		}
		if applied.Name != asset.name {
			return fmt.Errorf("migration %d name mismatch", version)
		}
		if applied.Checksum != asset.checksum {
			return fmt.Errorf("migration %d checksum mismatch", version)
		}
		if version > highest {
			highest = version
		}
	}
	for _, asset := range manifest {
		if asset.version <= highest {
			if _, exists := ledger[asset.version]; !exists {
				return fmt.Errorf("migration %d missing below applied version %d", asset.version, highest)
			}
		}
	}
	return nil
}

func validateAllApplied(manifest []migrationAsset, ledger map[int64]MigrationInfo) error {
	if err := validateLedger(manifest, ledger); err != nil {
		return err
	}
	for _, asset := range manifest {
		if _, applied := ledger[asset.version]; !applied {
			return fmt.Errorf("migration %d is not applied", asset.version)
		}
	}
	return nil
}

func setStatementTimeout(ctx context.Context, conn *sql.Conn, timeout time.Duration) error {
	_, err := conn.ExecContext(ctx, `SELECT set_config('statement_timeout', $1, false)`, fmt.Sprintf("%d", timeout.Milliseconds()))
	return err
}

func resetStatementTimeout(ctx context.Context, conn *sql.Conn) error {
	_, err := conn.ExecContext(ctx, `SELECT set_config('statement_timeout', '0', false)`)
	return err
}

func discardMigrationConn(conn *sql.Conn) {
	_ = conn.Raw(func(any) error { return driver.ErrBadConn })
}

// MigrationStatus reads migration state without creating the ledger or applying SQL.
func MigrationStatus(ctx context.Context, db *sql.DB) ([]MigrationInfo, error) {
	if db == nil {
		return nil, fmt.Errorf("migration status: nil database")
	}
	manifest, err := loadManifest()
	if err != nil {
		return nil, err
	}
	timeouts, err := migrationTimeoutConfig()
	if err != nil {
		return nil, err
	}
	operation, cancel := context.WithTimeout(ctx, timeouts.overall)
	defer cancel()
	conn, err := db.Conn(operation)
	if err != nil {
		return nil, fmt.Errorf("acquire migration connection: %w", err)
	}
	defer func() {
		_ = conn.Close()
	}()

	exists, err := ledgerExists(operation, conn)
	if err != nil {
		return nil, fmt.Errorf("inspect migration ledger: %w", err)
	}
	ledger := map[int64]MigrationInfo{}
	if exists {
		ledger, err = readLedger(operation, conn)
		if err != nil {
			return nil, fmt.Errorf("read migration ledger: %w", err)
		}
		if err := validateLedger(manifest, ledger); err != nil {
			return nil, err
		}
	}

	status := make([]MigrationInfo, 0, len(manifest))
	for _, asset := range manifest {
		_, applied := ledger[asset.version]
		status = append(status, MigrationInfo{Version: asset.version, Name: asset.name, Checksum: asset.checksum, Applied: applied})
	}
	return status, nil
}

// ValidateMigrations verifies that the database has exactly the applied prefix of the manifest.
// Server startup uses this read-only check and never applies DDL.
func ValidateMigrations(ctx context.Context, db *sql.DB) error {
	if db == nil {
		return fmt.Errorf("validate migrations: nil database")
	}
	manifest, err := loadManifest()
	if err != nil {
		return err
	}
	timeouts, err := migrationTimeoutConfig()
	if err != nil {
		return err
	}
	operation, cancel := context.WithTimeout(ctx, timeouts.overall)
	defer cancel()
	conn, err := db.Conn(operation)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer func() {
		_ = conn.Close()
	}()

	exists, err := ledgerExists(operation, conn)
	if err != nil {
		return fmt.Errorf("inspect migration ledger: %w", err)
	}
	if !exists {
		return fmt.Errorf("migration ledger is missing")
	}
	ledger, err := readLedger(operation, conn)
	if err != nil {
		return fmt.Errorf("read migration ledger: %w", err)
	}
	return validateAllApplied(manifest, ledger)
}

// RunMigrations applies pending embedded migrations in order.
func RunMigrations(ctx context.Context, db *sql.DB) (retErr error) {
	if db == nil {
		return fmt.Errorf("run migrations: nil database")
	}
	manifest, err := loadManifest()
	if err != nil {
		return err
	}
	timeouts, err := migrationTimeoutConfig()
	if err != nil {
		return err
	}
	operation, cancel := context.WithTimeout(ctx, timeouts.overall)
	defer cancel()

	session, err := beginMigrationSession(operation, db, timeouts)
	if err != nil {
		return err
	}
	defer func() {
		if cleanupErr := session.finish(); cleanupErr != nil && retErr == nil {
			retErr = cleanupErr
		}
	}()

	ledger, err := prepareMigrationLedger(operation, session.conn, manifest)
	if err != nil {
		return err
	}
	return applyPendingMigrations(operation, session.conn, manifest, ledger, timeouts)
}

type migrationSession struct {
	conn         *sql.Conn
	timeouts     migrationTimeouts
	discard      bool
	locked       bool
	statementSet bool
}

func beginMigrationSession(ctx context.Context, db *sql.DB, timeouts migrationTimeouts) (*migrationSession, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("acquire migration connection: %w", err)
	}
	session := &migrationSession{conn: conn, timeouts: timeouts}

	lockContext, cancelLock := context.WithTimeout(ctx, timeouts.lock)
	defer cancelLock()
	if _, err := conn.ExecContext(lockContext, migrationLockSQL(true)); err != nil {
		session.discard = true
		_ = conn.Close()
		return nil, fmt.Errorf("acquire migration lock: %w", err)
	}
	session.locked = true

	if err := setStatementTimeout(ctx, conn, timeouts.statement); err != nil {
		_ = session.finish()
		return nil, fmt.Errorf("set migration statement timeout: %w", err)
	}
	session.statementSet = true
	return session, nil
}

func (s *migrationSession) finish() error {
	var errs []error
	if s.statementSet {
		resetContext, cancelReset := context.WithTimeout(context.Background(), s.timeouts.lock)
		if resetErr := resetStatementTimeout(resetContext, s.conn); resetErr != nil {
			s.discard = true
			errs = append(errs, fmt.Errorf("reset migration statement timeout: %w", resetErr))
		}
		cancelReset()
	}
	if s.locked {
		unlockContext, cancelUnlock := context.WithTimeout(context.Background(), s.timeouts.lock)
		if _, unlockErr := s.conn.ExecContext(unlockContext, migrationLockSQL(false)); unlockErr != nil {
			s.discard = true
			errs = append(errs, fmt.Errorf("release migration lock: %w", unlockErr))
		}
		cancelUnlock()
	}
	if s.discard {
		discardMigrationConn(s.conn)
	}
	if closeErr := s.conn.Close(); closeErr != nil {
		errs = append(errs, closeErr)
	}
	return errors.Join(errs...)
}

func migrationLockSQL(acquire bool) string {
	if acquire {
		return `SELECT pg_advisory_lock(hashtextextended('6s schema migrations', 0))`
	}
	return `SELECT pg_advisory_unlock(hashtextextended('6s schema migrations', 0))`
}

func prepareMigrationLedger(ctx context.Context, conn *sql.Conn, manifest []migrationAsset) (map[int64]MigrationInfo, error) {
	exists, err := ledgerExists(ctx, conn)
	if err != nil {
		return nil, fmt.Errorf("inspect migration ledger: %w", err)
	}
	if !exists {
		if _, err := conn.ExecContext(ctx, migrationLedgerDDL()); err != nil {
			return nil, fmt.Errorf("create migration ledger: %w", err)
		}
		return map[int64]MigrationInfo{}, nil
	}
	ledger, err := readLedger(ctx, conn)
	if err != nil {
		return nil, fmt.Errorf("read migration ledger: %w", err)
	}
	if err := validateLedger(manifest, ledger); err != nil {
		return nil, err
	}
	return ledger, nil
}

func applyPendingMigrations(ctx context.Context, conn *sql.Conn, manifest []migrationAsset, ledger map[int64]MigrationInfo, timeouts migrationTimeouts) error {
	for _, asset := range manifest {
		if _, applied := ledger[asset.version]; applied {
			continue
		}
		statementContext, cancelStatement := context.WithTimeout(ctx, timeouts.statement)
		err := applyMigration(statementContext, conn, asset)
		cancelStatement()
		if err != nil {
			return fmt.Errorf("apply migration %s: %w", asset.name, err)
		}
	}
	return nil
}

func applyMigration(ctx context.Context, conn *sql.Conn, asset migrationAsset) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, string(asset.body)); err == nil {
		_, err = tx.ExecContext(ctx,
			`INSERT INTO public.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`,
			asset.version, asset.name, asset.checksum,
		)
	}
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
