# Domain Workflow Hardening

Status: Implemented; focused verification passed. Full suite has one unrelated environment-sensitive AI DNS failure.

## Goal
Remove confirmed lifecycle bypasses, make scoring configuration updates atomic, and apply site/visibility authorization to all score-ledger and leaderboard reads.

## Invariants
- Public issue resolution may transition only `OPEN` to `PENDING_REVIEW`, with current `version`; no client-controlled bypass.
- A scoring-rule update either commits rules, retroactive deltas, and audit together or persists none.
- Every score/report response is limited to caller site and issue visibility; direct issue score logs use same policy as issue detail.
- Existing HTTP shapes remain compatible except `force` no longer changes resolution semantics.
- No new dependencies or broad schema redesign.

## Tasks
- [ ] 1. Lock resolution transition in `internal/issue/handler.go`, `internal/issue/workflow.go`, `internal/db/issue_tx.go`, and `sql/queries.sql`.
  Remove public `force` behavior and obsolete `ForceResolveIssue` interface/query path. Require positive `expected_version`; keep SQL predicate `status = 'OPEN' AND deleted_at IS NULL AND version = expected_version`. Preserve 400 for malformed/missing input and 409 for stale/non-open issue.
  Verify: regression tests prove `force=true` cannot resolve `CLOSED`, `INVALID`, or `PENDING_REVIEW`; stale version returns 409; ordinary authorized OPEN resolve remains successful.

- [ ] 2. Replace scoring update sequence with one transactional store operation in `internal/scoring/service.go` and `internal/db`.
  Add one domain-level DB method that locks/updates requested rules, computes and inserts all retroactive deltas, then writes audit before commit. Move `recalculateRetroactive` persistence behind it; preserve current rule validation, date scope, per-issue batching, and idempotency constraint for dated logs. Do not swallow audit failure.
  Verify: injected rule-upsert, retro-delta, and audit failures each leave rules and score logs unchanged; successful update commits rule values, expected deltas, and exactly one audit entry.

- [ ] 3. Introduce shared score-read authorization scope.
  Extend score service APIs and SQL parameter structs with authenticated `site_id`, `user_id`, role, and optional location scope. Reuse issue visibility predicate semantics for direct issue ledgers, target score logs, and leaderboard aggregates. Validate target ID belongs to caller-visible site before returning data.
  Verify: user cannot read another user's restricted issue ledger; cross-site location/user target returns no data or forbidden according to existing API convention; line leader sees only active assigned locations; admin/safety officer retain permitted site-wide views.

- [ ] 4. Wire route policy and error behavior in `cmd/server/main.go` and `internal/scoring/handler.go`.
  Require `reports:view` for every score read endpoint, including `/api/issues/{id}/score-logs`. Resolve caller from authenticated context before service calls. Map unauthorized/restricted direct-object reads to existing 404/403 convention without leaking existence; retain deleted-view permission gate.
  Verify: router-level test matrix covers unauthenticated, authenticated without `reports:view`, same-site authorized, restricted issue, deleted issue, and cross-site target cases.

- [ ] 5. Update focused regression tests before implementation.
  Extend `internal/issue/service_test.go` and handler tests for lifecycle invariants. Extend `internal/scoring/service_test.go`, `handler_test.go`, and database-backed/integration tests for atomic rollback and scoped score reads. Keep assertions on persisted state and HTTP contracts, not internal calls.
  Verify: each new regression fails on current code for expected reason, then passes after its minimal fix.

- [ ] 6. Regenerate and validate generated DB/API artifacts only if changed source contracts require them.
  Update `sql/queries.sql`, run canonical `./scripts/_sqlc.sh generate` when SQL signatures change, and regenerate OpenAPI client only if route payload/schema removes `force`. Remove obsolete generated code rather than leaving aliases.
  Verify: generated-artifact check passes; no caller still sends or depends on `force`.

- [ ] 7. Run verification and smoke real routes.
  Run focused server unit tests, relevant database/integration target, then mandatory `./leedevkit test all`. Start managed dev environment only if required by existing E2E target; exercise authorized resolution, rejected stale resolution, atomic scoring update failure, and denied cross-site ledger read through HTTP.
  Verify: all required checks pass. If the known AI DNS test still fails because resolver maps invalid host to `0.0.0.0`/`::`, report it separately; do not mask it.

## Done When
- [ ] No public path performs force resolution or bypasses status/version state checks.
- [ ] Scoring rule, retroactive score, and audit writes are all-or-nothing.
- [ ] Leaderboards and all score ledgers enforce caller site and issue visibility.
- [ ] Behavioral regression tests cover every confirmed finding.
- [ ] `./leedevkit test all` passes, with runtime smoke evidence for changed HTTP paths.

## Review Focus
- SQL visibility predicate must stay semantically aligned with `issue.canViewIssue`.
- Transaction rollback must cover every requested rule and every retroactive delta.
- Do not expose cross-site issue existence via score endpoints.
- Preserve offline normal-resolution conflict handling after required version validation.
