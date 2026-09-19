package database

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// migrationTestDB provisions an isolated database. Tests are skipped unless the
// explicitly opt-in TEST_DB_DSN role can create/drop databases.
func migrationTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("TEST_DB_DSN"))
	if dsn == "" {
		t.Skip("TEST_DB_DSN is not set")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("parse TEST_DB_DSN: %v", err)
	}
	admin, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open admin DB: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		admin.Close()
		t.Fatalf("ping TEST_DB_DSN: %v", err)
	}
	name := fmt.Sprintf("migration_it_%d", time.Now().UnixNano())
	if _, err := admin.ExecContext(context.Background(), `CREATE DATABASE "`+name+`"`); err != nil {
		admin.Close()
		t.Fatalf("create test DB: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.ExecContext(context.Background(), `DROP DATABASE IF EXISTS "`+name+`" WITH (FORCE)`)
		_ = admin.Close()
	})
	u.Path = "/" + name
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatalf("open test DB: %v", err)
	}
	db.SetMaxOpenConns(8)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestPostgresConcurrentMigrationsBootstrap(t *testing.T) {
	db := migrationTestDB(t)
	start := make(chan struct{})
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			errs[i] = RunMigrations(ctx, db)
		}(i)
	}
	close(start)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("migrator %d failed: %v", i, err)
		}
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	manifest, err := loadManifest()
	if err != nil {
		t.Fatal(err)
	}
	if count != len(manifest) {
		t.Fatalf("ledger rows=%d, manifest=%d", count, len(manifest))
	}
}

func TestPostgresStatusAbsentLedgerIsReadOnly(t *testing.T) {
	db := migrationTestDB(t)
	status, err := MigrationStatus(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := loadManifest()
	if err != nil {
		t.Fatal(err)
	}
	if len(status) != len(manifest) {
		t.Fatalf("status=%d, manifest=%d", len(status), len(manifest))
	}
	var exists *string
	if err := db.QueryRow(`SELECT to_regclass('public.schema_migrations')`).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != nil {
		t.Fatal("status must not create schema_migrations")
	}
}

func TestPostgresRerunPreservesHistoricalData(t *testing.T) {
	db := migrationTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatal(err)
	}
	username := fmt.Sprintf("migration-regression-%d", time.Now().UnixNano())
	if _, err := db.Exec(`INSERT INTO users (site_id, username, full_name) SELECT id, $1, $2 FROM sites WHERE code = 'DEFAULT'`, username, "Migration Regression User"); err != nil {
		t.Fatalf("insert historical fixture: %v", err)
	}
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users WHERE username = $1`, username).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("historical row count=%d", count)
	}
}

func TestPostgresPreflightRejectsUnknownLedgerVersion(t *testing.T) {
	db := migrationTestDB(t)
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version BIGINT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO schema_migrations(version,name,checksum) VALUES (999999,'999999_unknown.up.sql','deadbeef')`); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(context.Background(), db); err == nil || !strings.Contains(err.Error(), "unknown migration") {
		t.Fatalf("expected unknown migration preflight error, got %v", err)
	}
	var tables int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pg_class WHERE relname='users'`).Scan(&tables); err != nil {
		t.Fatal(err)
	}
	if tables != 0 {
		t.Fatal("preflight failure must happen before migration DDL")
	}
}

func TestPostgresPreflightRejectsChecksumMismatch(t *testing.T) {
	db := migrationTestDB(t)
	if _, err := db.Exec(`CREATE TABLE schema_migrations (version BIGINT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	manifest, err := loadManifest()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO schema_migrations(version,name,checksum) VALUES ($1,$2,'bad')`, manifest[0].version, manifest[0].name); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(context.Background(), db); err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("expected checksum mismatch, got %v", err)
	}
	var tables int
	if err := db.QueryRow(`SELECT COUNT(*) FROM pg_class WHERE relname='users'`).Scan(&tables); err != nil {
		t.Fatal(err)
	}
	if tables != 0 {
		t.Fatal("checksum preflight must prevent migration DDL")
	}
}
