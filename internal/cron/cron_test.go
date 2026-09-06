package cron

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"6s/internal/db"
)

type mockCronStore struct {
	lastLogs     map[string]db.CronTaskLog
	overdue      []db.ListOpenOverdueIssuesRow
	rules        map[string]int32
	scoreLogs    []db.InsertScoreLogParams
	photos       []string
	auditCleaned bool
}

func (m *mockCronStore) GetLastCronTaskLog(_ context.Context, taskName string) (db.CronTaskLog, error) {
	logEntry, ok := m.lastLogs[taskName]
	if !ok {
		return db.CronTaskLog{}, sql.ErrNoRows
	}
	return logEntry, nil
}

func (m *mockCronStore) InsertCronTaskLog(_ context.Context, arg db.InsertCronTaskLogParams) (db.CronTaskLog, error) {
	entry := db.CronTaskLog{
		TaskName:  arg.TaskName,
		Status:    arg.Status,
		LastRunAt: time.Now(),
		Details:   arg.Details,
	}
	if m.lastLogs == nil {
		m.lastLogs = make(map[string]db.CronTaskLog)
	}
	m.lastLogs[arg.TaskName] = entry
	return entry, nil
}

func (m *mockCronStore) ListOpenOverdueIssues(_ context.Context) ([]db.ListOpenOverdueIssuesRow, error) {
	return m.overdue, nil
}

func (m *mockCronStore) InsertScoreLog(_ context.Context, arg db.InsertScoreLogParams) error {
	m.scoreLogs = append(m.scoreLogs, arg)
	return nil
}

func (m *mockCronStore) GetScoringRuleByKey(_ context.Context, ruleKey string) (db.ScoringRule, error) {
	pts, ok := m.rules[ruleKey]
	if !ok {
		return db.ScoringRule{}, sql.ErrNoRows
	}
	return db.ScoringRule{RuleKey: ruleKey, Points: pts}, nil
}

func (m *mockCronStore) ListAllActivePhotoBasenames(_ context.Context) ([]string, error) {
	return m.photos, nil
}

func (m *mockCronStore) CleanupOldAuditLogs(_ context.Context) error {
	m.auditCleaned = true
	return nil
}

func TestCron_OverduePenaltyCatchup(t *testing.T) {
	store := &mockCronStore{
		rules: map[string]int32{
			"penalty_overdue": -5,
		},
		overdue: []db.ListOpenOverdueIssuesRow{
			{ID: 1, LocationCode: "LINE_A1", CreatedAt: time.Now().Add(-50 * time.Hour)},
		},
	}

	runner := NewRunner(store, time.UTC, "")
	ctx := context.Background()

	// 1. Initial catchup scan should run because no previous log exists
	runner.CheckAndRunOverdueCatchup(ctx)

	if len(store.scoreLogs) != 1 {
		t.Fatalf("expected 1 overdue score log inserted, got %d", len(store.scoreLogs))
	}
	if store.scoreLogs[0].Points != -5 || store.scoreLogs[0].RuleKey != "penalty_overdue" {
		t.Errorf("expected penalty_overdue -5, got %+v", store.scoreLogs[0])
	}
	if store.lastLogs[TaskOverduePenaltyScan].Status != "SUCCESS" {
		t.Errorf("expected SUCCESS task log, got %+v", store.lastLogs[TaskOverduePenaltyScan])
	}

	// 2. Second run on same day should skip (idempotent)
	runner.CheckAndRunOverdueCatchup(ctx)
	if len(store.scoreLogs) != 1 {
		t.Errorf("expected still 1 score log after second same-day check, got %d", len(store.scoreLogs))
	}
}

func TestCron_RunCleanup(t *testing.T) {
	store := &mockCronStore{}
	tempDir := t.TempDir()
	runner := NewRunner(store, time.UTC, tempDir)
	ctx := context.Background()

	// 1. Audit logs cleanup
	runner.RunCleanupAuditLogs(ctx)
	if !store.auditCleaned {
		t.Fatal("expected audit logs to be cleaned")
	}

	// 2. Orphan photos cleanup
	runner.RunCleanupOrphans(ctx)
	if store.lastLogs[TaskCleanupOrphans].Status != "SUCCESS" {
		t.Errorf("expected SUCCESS for cleanup orphans, got %s", store.lastLogs[TaskCleanupOrphans].Status)
	}
}

func TestCron_Tick(t *testing.T) {
	store := &mockCronStore{photos: []string{}}
	runner := NewRunner(store, time.UTC, t.TempDir())
	ctx := context.Background()

	// Hour 0 -> overdue catchup
	runner.tick(ctx, time.Date(2026, 3, 1, 0, 30, 0, 0, time.UTC))
	if store.lastLogs[TaskOverduePenaltyScan].Status != "SUCCESS" {
		t.Errorf("expected overdue scan SUCCESS at hour 0, got %s", store.lastLogs[TaskOverduePenaltyScan].Status)
	}

	// Hour 1 -> cleanup orphans
	runner.tick(ctx, time.Date(2026, 3, 1, 1, 30, 0, 0, time.UTC))
	if store.lastLogs[TaskCleanupOrphans].Status != "SUCCESS" {
		t.Errorf("expected cleanup orphans SUCCESS at hour 1, got %s", store.lastLogs[TaskCleanupOrphans].Status)
	}

	// Sunday hour 2 -> audit logs
	runner.tick(ctx, time.Date(2026, 3, 1, 2, 30, 0, 0, time.UTC)) // 2026-03-01 is Sunday
	if !store.auditCleaned {
		t.Fatal("expected audit cleanup on Sunday 02:00")
	}

	// Hour 10 -> nothing runs
	store.lastLogs = map[string]db.CronTaskLog{}
	store.auditCleaned = false
	runner.tick(ctx, time.Date(2026, 3, 1, 10, 30, 0, 0, time.UTC))
	if len(store.lastLogs) != 0 {
		t.Errorf("expected no cron tasks at hour 10, got %v", store.lastLogs)
	}
}

func TestCron_StartContextCancel(t *testing.T) {
	store := &mockCronStore{photos: []string{}}
	runner := NewRunner(store, time.UTC, t.TempDir())
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		runner.Start(ctx)
		close(done)
	}()

	cancel()
	select {
	case <-done:
		// ok
	case <-time.After(2 * time.Second):
		t.Fatal("Start did not exit after context cancellation")
	}
}

type errCronStore struct {
	mockCronStore
	overdueErr error
	insertErr  error
}

func (m *errCronStore) ListOpenOverdueIssues(_ context.Context) ([]db.ListOpenOverdueIssuesRow, error) {
	if m.overdueErr != nil {
		return nil, m.overdueErr
	}
	return m.mockCronStore.ListOpenOverdueIssues(context.Background())
}

func (m *errCronStore) InsertCronTaskLog(_ context.Context, arg db.InsertCronTaskLogParams) (db.CronTaskLog, error) {
	if m.insertErr != nil {
		return db.CronTaskLog{}, m.insertErr
	}
	return m.mockCronStore.InsertCronTaskLog(context.Background(), arg)
}

func TestCron_OverduePenaltyScanErrors(t *testing.T) {
	base := &mockCronStore{}
	errStore := &errCronStore{mockCronStore: *base, overdueErr: errors.New("db down")}
	runner := NewRunner(errStore, time.UTC, t.TempDir())
	ctx := context.Background()

	// ListOpenOverdueIssues error path
	runner.RunOverduePenaltyScan(ctx, time.Now().Format("2006-01-02"))
	if errStore.lastLogs[TaskOverduePenaltyScan].Status != "FAILED" {
		t.Errorf("expected FAILED status on overdue scan error, got %s", errStore.lastLogs[TaskOverduePenaltyScan].Status)
	}

	// InsertCronTaskLog error path should not panic
	errStore.insertErr = errors.New("insert failed")
	errStore.overdueErr = nil
	runner.RunOverduePenaltyScan(ctx, time.Now().Format("2006-01-02"))
}

func TestCron_CleanupOrphansRemovesFiles(t *testing.T) {
	store := &mockCronStore{photos: []string{"before/uuid1.jpg", "", "after/uuid2.png"}}
	tempDir := t.TempDir()
	runner := NewRunner(store, time.UTC, tempDir)
	ctx := context.Background()

	// Create orphan + active files
	orphan := filepath.Join(tempDir, "before", "orphan.jpg")
	active := filepath.Join(tempDir, "before", "uuid1.jpg")
	for _, f := range []string{orphan, active} {
		if err := os.MkdirAll(filepath.Dir(f), 0750); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(f, []byte("x"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	oldTime := time.Now().Add(-2 * time.Hour)
	_ = os.Chtimes(orphan, oldTime, oldTime)

	runner.RunCleanupOrphans(ctx)

	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Errorf("expected orphan to be removed")
	}
	if _, err := os.Stat(active); err != nil {
		t.Errorf("expected active file to remain: %v", err)
	}
}
