package cron

import (
	"context"
	"database/sql"
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
