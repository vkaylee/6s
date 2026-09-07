# Target
Own `internal/database/database.go`, migration SQL/runbook, health/readiness route section in `cmd/server/main.go`, Docker healthcheck, database tests. Do not edit auth, scoring, observability middleware, or frontend.

# Change
Implement version-tracked migrations with safe repeat startup, ordering, failure handling, and rollback expectations. Preserve embedded migration assets. Separate liveness from DB readiness; readiness must fail when DB is unavailable. Update healthcheck to readiness. Add focused tests or deterministic smoke coverage.

# Acceptance
Each migration executes once, restart is safe, failure is visible and non-destructive, readiness status reflects DB. Document operator rollback. Rebase before touching `main.go`. Commit owned files.