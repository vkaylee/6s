package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"6s/internal/database"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver for the throwaway database.
)

// newSetupTestDB provisions a throwaway PostgreSQL database from the embedded
// production migrations. Advisory-lock serialization cannot be exercised
// through mocks, so these tests skip unless TEST_DB_DSN points at a reachable
// PostgreSQL URL whose role may create databases.
func newSetupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("TEST_DB_DSN"))
	if dsn == "" {
		t.Skip("TEST_DB_DSN is not set; skipping PostgreSQL bootstrap coverage")
	}
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("parse TEST_DB_DSN: %v", err)
	}
	if parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" {
		t.Fatalf("TEST_DB_DSN must be a postgres:// URL, got scheme %q", parsed.Scheme)
	}

	admin, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open TEST_DB_DSN: %v", err)
	}
	pingCtx, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelPing()
	if err := admin.PingContext(pingCtx); err != nil {
		_ = admin.Close()
		t.Fatalf("TEST_DB_DSN is unreachable: %v", err)
	}

	name := fmt.Sprintf("bootstrap_it_%d", time.Now().UnixNano())
	if _, err := admin.ExecContext(context.Background(), `CREATE DATABASE "`+name+`"`); err != nil {
		_ = admin.Close()
		t.Fatalf("create throwaway database: %v", err)
	}
	t.Cleanup(func() {
		if _, err := admin.ExecContext(context.Background(), `DROP DATABASE IF EXISTS "`+name+`" WITH (FORCE)`); err != nil {
			t.Errorf("drop throwaway database %s: %v", name, err)
		}
		_ = admin.Close()
	})
	if _, err := admin.ExecContext(context.Background(), `ALTER DATABASE "`+name+`" SET default_transaction_isolation TO 'repeatable read'`); err != nil {
		t.Fatalf("set repeatable-read database default: %v", err)
	}

	parsed.Path = "/" + name
	testDB, err := sql.Open("pgx", parsed.String())
	if err != nil {
		t.Fatalf("open throwaway database: %v", err)
	}
	testDB.SetMaxOpenConns(8)
	t.Cleanup(func() { _ = testDB.Close() })

	migrateCtx, cancelMigrate := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancelMigrate()
	if err := database.RunMigrations(migrateCtx, testDB); err != nil {
		t.Fatalf("migrate throwaway database: %v", err)
	}
	return testDB
}

func countUsers(t *testing.T, sqlDB *sql.DB) int64 {
	t.Helper()
	var total int64
	if err := sqlDB.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM users").Scan(&total); err != nil {
		t.Fatalf("count users: %v", err)
	}
	return total
}

func bootstrapParams(username string) CreateLocalAdminParams {
	return CreateLocalAdminParams{
		Username:     username,
		PasswordHash: sql.NullString{String: "argon2id-placeholder", Valid: true},
		FullName:     "Bootstrap Admin",
	}
}

// Verify that a real concurrent bootstrap across pool connections produces one
// winner, one persisted superadmin, and no partial duplicates.
func TestCreateLocalAdminAtomicConcurrentBootstrap(t *testing.T) {
	for _, username := range []string{"bootstrap-%d", "same-admin"} {
		t.Run(username, func(t *testing.T) {
			sqlDB := newSetupTestDB(t)
			queries := New(sqlDB)
			const callers = 4
			start := make(chan struct{})
			results := make([]error, callers)
			var wg sync.WaitGroup
			for i := range callers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
					defer cancel()
					<-start
					name := username
					if strings.Contains(name, "%d") {
						name = fmt.Sprintf(name, i)
					}
					_, results[i] = queries.CreateLocalAdminAtomic(ctx, bootstrapParams(name))
				}()
			}
			close(start)
			wg.Wait()

			winners := 0
			for i, err := range results {
				switch {
				case err == nil:
					winners++
				case errors.Is(err, ErrSetupAlreadyInitialized):
				default:
					t.Errorf("caller %d returned unexpected error: %v", i, err)
				}
			}
			if winners != 1 {
				t.Fatalf("expected exactly one bootstrap winner, got %d with errors %v", winners, results)
			}

			adminCount, err := queries.CountAdmins(context.Background())
			if err != nil {
				t.Fatalf("count admins: %v", err)
			}
			if adminCount != 1 {
				t.Errorf("expected exactly one persisted admin, got %d", adminCount)
			}
			if total := countUsers(t, sqlDB); total != 1 {
				t.Errorf("losing bootstrap attempts must not persist users, got %d rows", total)
			}
		})
	}
}

// The bootstrap boundary rejects a second setup once an admin exists.
func TestCreateLocalAdminAtomicRejectsSecondBootstrap(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	queries := New(sqlDB)
	ctx := context.Background()

	if _, err := queries.CreateLocalAdminAtomic(ctx, bootstrapParams("first-admin")); err != nil {
		t.Fatalf("initial bootstrap: %v", err)
	}
	_, err := queries.CreateLocalAdminAtomic(ctx, bootstrapParams("second-admin"))
	if !errors.Is(err, ErrSetupAlreadyInitialized) {
		t.Fatalf("expected ErrSetupAlreadyInitialized for repeated bootstrap, got %v", err)
	}
	if total := countUsers(t, sqlDB); total != 1 {
		t.Errorf("rejected bootstrap must not persist a user, got %d rows", total)
	}
}

// A failing insert rolls back the transaction, persists nothing, and releases
// the advisory lock so a later valid bootstrap still succeeds.
func TestCreateLocalAdminAtomicRollbackReleasesLock(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	queries := New(sqlDB)
	ctx := context.Background()

	overlong := strings.Repeat("a", 200)
	if _, err := queries.CreateLocalAdminAtomic(ctx, bootstrapParams(overlong)); err == nil {
		t.Fatal("expected the oversized username to fail the insert")
	} else if errors.Is(err, ErrSetupAlreadyInitialized) {
		t.Fatalf("insert failure must not be reported as an existing admin: %v", err)
	}

	if total := countUsers(t, sqlDB); total != 0 {
		t.Errorf("failed bootstrap must roll back completely, got %d rows", total)
	}

	if _, err := queries.CreateLocalAdminAtomic(ctx, bootstrapParams("recovered-admin")); err != nil {
		t.Fatalf("bootstrap after rolled-back attempt: %v", err)
	}
	adminCount, err := queries.CountAdmins(ctx)
	if err != nil {
		t.Fatalf("count admins: %v", err)
	}
	if adminCount != 1 {
		t.Errorf("expected exactly one admin after recovery, got %d", adminCount)
	}
}

// waitForAdvisoryWaiter blocks until a backend is queued on an advisory lock,
// giving cancellation tests a deterministic handshake instead of a sleep.
func waitForAdvisoryWaiter(t *testing.T, sqlDB *sql.DB) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		var waiters int64
		err := sqlDB.QueryRowContext(context.Background(),
			`SELECT COUNT(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`).Scan(&waiters)
		if err != nil {
			t.Fatalf("inspect advisory locks: %v", err)
		}
		if waiters > 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("no backend queued on the bootstrap advisory lock within the deadline")
}

// Canceling a bootstrap that is genuinely waiting on a contended advisory lock
// must abort the transaction, persist nothing, and leave the lock available so
// a later setup succeeds once the holder releases it.
func TestCreateLocalAdminAtomicCanceledWhileWaitingOnLock(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	queries := New(sqlDB)
	ctx := context.Background()

	holder, err := sqlDB.Conn(ctx)
	if err != nil {
		t.Fatalf("reserve holder connection: %v", err)
	}
	t.Cleanup(func() { _ = holder.Close() })
	if _, err := holder.ExecContext(ctx,
		`SELECT pg_advisory_lock(hashtextextended('6s initial superadmin setup', 0))`); err != nil {
		t.Fatalf("hold bootstrap advisory lock: %v", err)
	}
	lockHeld := true
	t.Cleanup(func() {
		if lockHeld {
			_, _ = holder.ExecContext(context.Background(),
				`SELECT pg_advisory_unlock(hashtextextended('6s initial superadmin setup', 0))`)
		}
	})

	waitCtx, cancel := context.WithCancel(ctx)
	result := make(chan error, 1)
	go func() {
		_, err := queries.CreateLocalAdminAtomic(waitCtx, bootstrapParams("contended-admin"))
		result <- err
	}()

	waitForAdvisoryWaiter(t, sqlDB)
	cancel()

	select {
	case err := <-result:
		if err == nil {
			t.Fatal("expected the canceled lock wait to abort the bootstrap")
		}
		if errors.Is(err, ErrSetupAlreadyInitialized) {
			t.Fatalf("a lock-wait cancellation is not an existing-admin conflict: %v", err)
		}
	case <-time.After(30 * time.Second):
		t.Fatal("canceled bootstrap did not return")
	}

	if total := countUsers(t, sqlDB); total != 0 {
		t.Errorf("canceled bootstrap must persist nothing, got %d rows", total)
	}
	if _, err := holder.ExecContext(ctx,
		`SELECT pg_advisory_unlock(hashtextextended('6s initial superadmin setup', 0))`); err != nil {
		t.Fatalf("release bootstrap advisory lock: %v", err)
	}
	lockHeld = false

	if _, err := queries.CreateLocalAdminAtomic(ctx, bootstrapParams("retry-admin")); err != nil {
		t.Fatalf("bootstrap after canceled lock wait: %v", err)
	}
	if total := countUsers(t, sqlDB); total != 1 {
		t.Errorf("expected exactly one persisted admin after retry, got %d rows", total)
	}
}
