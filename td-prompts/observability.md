# Target
Own logging/response middleware, `internal/notification/worker.go`, `internal/cron/cron.go`, audit/error serialization, and SSE timeout grouping in `cmd/server/main.go` after auth branch rebase. Do not alter auth rotation/config validation.

# Change
Emit structured JSON logs with severity, timestamp, request ID, route, status, duration; echo request ID safely. Propagate context into workers/cron. Mask PII and avoid internal DB error leakage. Replace fragile SSE path timeout special-case with route grouping/tagging. Preserve useful diagnostics.

# Acceptance
Logs parse as JSON and contain correlation ID without secrets/PII. Client errors are stable and generic. SSE remains long-lived; ordinary routes retain timeout. Focused tests/smoke checks pass. Commit owned files.