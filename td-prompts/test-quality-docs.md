# Target
Own `internal/db/queries_test.go` and test-support files, skipped E2E metadata/spec, duplicate Playwright config, lint backlog files, `README.md`, retention policy documentation/runbook. Do not edit `.env.example` owned by security-config; do not rewrite production behavior except tiny testability fixes approved by evidence.

# Change
Replace error-swallowing generated-query smoke test with behavior assertions or real-DB integration coverage matching available project setup. Fix confirmed gofmt/revive/gocognit/errcheck/govet findings without suppressions. Delete exactly one duplicate Playwright config. Give skipped E2E an owner/reason/expiry or restore it. Add concise setup/verification README. Reconcile audit retention (12 months vs 3 years) with an explicit approved policy; do not guess.

# Acceptance
Tests fail on real errors, skipped test is governed, lint findings are zero or explicitly justified, docs match commands/config. Run focused checks after dependencies 1, 3, 7 are merged. Commit owned files only.