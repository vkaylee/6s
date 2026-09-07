# Target
Own `internal/issue/service.go`, `internal/scoring/service.go`, `sql/queries.sql`, generated SQLC output only through the project generator, and focused backend tests. Do not edit API client/frontend or auth.

# Change
Remove database queries inside issue list/detail and leaderboard loops. Batch-fetch tags and related records. Bound or safely stream `ListIssuesForExport`; preserve output contract. Add query-count/behavior regression checks. Regenerate SQLC artifacts; never hand-edit generated files.

# Acceptance
Query count is O(1) per request shape, rows/tags remain correct, export cannot allocate unbounded results. Focused tests pass. Commit owned files; report query changes and migration/index needs.