package cron

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"6s/internal/db"
	"6s/internal/observability"
)

// Task names.
const (
	TaskOverduePenaltyScan = "OVERDUE_PENALTY_SCAN"
	TaskCleanupOrphans     = "CLEANUP_ORPHANS"
	TaskCleanupAuditLogs   = "CLEANUP_AUDIT_LOGS"
)

// Store defines database operations required by Cron runner.
type Store interface {
	GetLastCronTaskLog(ctx context.Context, taskName string) (db.CronTaskLog, error)
	InsertCronTaskLog(ctx context.Context, arg db.InsertCronTaskLogParams) (db.CronTaskLog, error)
	ListOpenOverdueIssues(ctx context.Context) ([]db.ListOpenOverdueIssuesRow, error)
	InsertScoreLog(ctx context.Context, arg db.InsertScoreLogParams) error
	GetScoringRuleByKey(ctx context.Context, ruleKey string) (db.ScoringRule, error)
	ListAllActivePhotoBasenames(ctx context.Context) ([]string, error)
	CleanupOldAuditLogs(ctx context.Context) error
}

// Runner manages periodic background cron tasks.
type Runner struct {
	store      Store
	loc        *time.Location
	storageDir string
}

// NewRunner creates a new Cron Runner.
func NewRunner(store Store, loc *time.Location, storageDir string) *Runner {
	if loc == nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	return &Runner{
		store:      store,
		loc:        loc,
		storageDir: storageDir,
	}
}

// Start launches cron ticker routines and runs bootstrap catch-up scans.
func (r *Runner) Start(ctx context.Context) {
	// Bootstrap catch-up check on server boot (SPEC.md Section 10.3)
	r.CheckAndRunOverdueCatchup(ctx)

	// Midnight ticker (runs every hour to check for 00:00 local)
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case t := <-ticker.C:
			r.tick(ctx, t)
		}
	}
}

func (r *Runner) tick(ctx context.Context, t time.Time) {
	localTime := t.In(r.loc)
	hour := localTime.Hour()

	// Run OVERDUE_PENALTY_SCAN at 00:00 local time
	if hour == 0 {
		r.CheckAndRunOverdueCatchup(ctx)
	}

	// Run CLEANUP_ORPHANS at 01:00 local time
	if hour == 1 {
		r.RunCleanupOrphans(ctx)
	}

	// Run CLEANUP_AUDIT_LOGS weekly on Sunday at 02:00 local time
	if hour == 2 && localTime.Weekday() == time.Sunday {
		r.RunCleanupAuditLogs(ctx)
	}
}

// CheckAndRunOverdueCatchup runs overdue penalty scan if not run today (or > 24h ago).
func (r *Runner) CheckAndRunOverdueCatchup(ctx context.Context) {
	lastLog, err := r.store.GetLastCronTaskLog(ctx, TaskOverduePenaltyScan)
	nowLocal := time.Now().In(r.loc)
	todayStr := nowLocal.Format("2006-01-02")

	if err == nil {
		lastRunLocal := lastLog.LastRunAt.In(r.loc)
		if lastRunLocal.Format("2006-01-02") == todayStr && lastLog.Status == "SUCCESS" {
			// Already executed today
			return
		}
	}

	r.RunOverduePenaltyScan(ctx, todayStr)
}

// RunOverduePenaltyScan scans issues OPEN > 48h and records daily penalty.
func (r *Runner) RunOverduePenaltyScan(ctx context.Context, penaltyDateStr string) {
	issues, err := r.store.ListOpenOverdueIssues(ctx)
	if err != nil {
		observability.Log("error", "cron overdue scan failed", map[string]any{"error": err.Error()})
		if _, lErr := r.store.InsertCronTaskLog(ctx, db.InsertCronTaskLogParams{
			TaskName: TaskOverduePenaltyScan,
			Status:   "FAILED",
			Details:  sql.NullString{String: "overdue penalty scan failed", Valid: true},
		}); lErr != nil {
			observability.Log("error", "cron failure log write failed", map[string]any{"error": lErr.Error()})
		}
		return
	}

	penaltyPoints := int32(-5)
	if rule, rErr := r.store.GetScoringRuleByKey(ctx, "penalty_overdue"); rErr == nil {
		penaltyPoints = rule.Points
	}

	penaltyDate, pErr := time.Parse("2006-01-02", penaltyDateStr)
	var nullPenaltyDate sql.NullTime
	if pErr == nil {
		nullPenaltyDate = sql.NullTime{Time: penaltyDate, Valid: true}
	}

	penalizedCount := 0
	for _, iss := range issues {
		// Insert score log with unique index uq_score_logs_overdue (idempotent)
		insErr := r.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
			IssueID:     iss.ID,
			TargetType:  "LOCATION",
			TargetID:    iss.LocationCode,
			RuleKey:     "penalty_overdue",
			Points:      penaltyPoints,
			PenaltyDate: nullPenaltyDate,
		})
		if insErr == nil {
			penalizedCount++
		}
	}

	details := fmt.Sprintf("Scanned %d overdue issues, penalized %d for date %s", len(issues), penalizedCount, penaltyDateStr)
	if _, lErr := r.store.InsertCronTaskLog(ctx, db.InsertCronTaskLogParams{
		TaskName: TaskOverduePenaltyScan,
		Status:   "SUCCESS",
		Details:  sql.NullString{String: details, Valid: true},
	}); lErr != nil {
		observability.Log("error", "cron success log write failed", map[string]any{"error": lErr.Error()})
	}
}

// RunCleanupOrphans removes files in uploads not referenced in database (SPEC.md Section 10.2).
func (r *Runner) RunCleanupOrphans(ctx context.Context) {
	activePhotos, err := r.store.ListAllActivePhotoBasenames(ctx)
	if err != nil {
		observability.Log("error", "cron orphan scan failed", map[string]any{"error": err.Error()})
		return
	}

	activeSet := make(map[string]bool, len(activePhotos))
	for _, p := range activePhotos {
		if p != "" {
			activeSet[filepath.Base(p)] = true
		}
	}

	removedCount := 0
	for _, sub := range []string{"before", "detail", "after"} {
		removedCount += r.cleanupDirOrphans(filepath.Join(r.storageDir, sub), activeSet)
	}

	details := fmt.Sprintf("Cleaned up %d orphan upload files", removedCount)
	if _, lErr := r.store.InsertCronTaskLog(ctx, db.InsertCronTaskLogParams{
		TaskName: TaskCleanupOrphans,
		Status:   "SUCCESS",
		Details:  sql.NullString{String: details, Valid: true},
	}); lErr != nil {
		observability.Log("error", "cron orphan log write failed", map[string]any{"error": lErr.Error()})
	}
}

func (r *Runner) cleanupDirOrphans(dir string, activeSet map[string]bool) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}

	removed := 0
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		fname := entry.Name()
		if activeSet[fname] {
			continue
		}
		info, statErr := entry.Info()
		if statErr != nil || time.Since(info.ModTime()) <= 1*time.Hour {
			continue
		}
		if remErr := os.Remove(filepath.Join(dir, fname)); remErr == nil {
			removed++
		}
	}
	return removed
}

// RunCleanupAuditLogs deletes audit logs older than 12 months (SPEC.md Section 10.2).
func (r *Runner) RunCleanupAuditLogs(ctx context.Context) {
	err := r.store.CleanupOldAuditLogs(ctx)
	status := "SUCCESS"
	var details sql.NullString
	if err != nil {
		status = "FAILED"
		details = sql.NullString{String: "audit log cleanup failed", Valid: true}
		observability.Log("error", "cron audit cleanup failed", map[string]any{"error": err.Error()})
	}

	if _, lErr := r.store.InsertCronTaskLog(ctx, db.InsertCronTaskLogParams{
		TaskName: TaskCleanupAuditLogs,
		Status:   status,
		Details:  details,
	}); lErr != nil {
		observability.Log("error", "cron audit log write failed", map[string]any{"error": lErr.Error()})
	}
}
