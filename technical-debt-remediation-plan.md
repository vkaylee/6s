# 6S Technical Debt Remediation Plan

## Decision

One isolated Paseo worktree per **mergeable ownership slice**, not per symptom. One worktree per finding would create avoidable conflicts in `main.go`, auth handlers, SQL, and shared frontend types. Every confirmed debt remains mapped below. Baseline: commit `b03fb5b` on `master`; it preserves the user’s `admin-page-split.md` and includes the Biome scope fix.

The current checkout stays untouched during dispatch. Create every worktree from `b03fb5b`; only the integration owner merges branches. Agents commit only owned files. Never reset, stash, or overwrite unrelated user changes.

## Worktree matrix

| Order | Worktree / branch | Owner | Scope | Dependencies |
|---|---|---|---|---|
| 0 | `td-baseline-verification` | test-engineer | Re-run current Go/Web lint, unit, E2E; capture baseline and confirm audit findings against current HEAD. No production edits. | none |
| 1 | `td-security-config` | security-auditor + backend | Fail-fast `DB_DSN`/`JWT_SECRET`; remove insecure defaults; enforce TLS DSN; shorten token TTLs; document intentional local-dev config in `.env.example`; add negative startup/config tests. | 0 |
| 2 | `td-auth-hardening` | security-auditor + backend | Remove `?token=` after caller inventory; lock down bootstrap admin; atomic refresh rotation; reuse-family revocation; audit PII masking; client-safe auth errors. | 0; coordinate with 1 |
| 3 | `td-migrations-readiness` | database-architect + backend | Versioned migration runner/table; transactional migration failure behavior; separate liveness/readiness; DB-aware health status; update Docker healthcheck/runbook. | 0 |
| 4 | `td-db-performance` | database-architect + performance | Batch issue tags; eliminate issue-detail/list and leaderboard N+1; bound or stream export; preserve SQLC/OpenAPI contracts; query-count regression checks. | 0 |
| 5 | `td-scoring-correctness` | backend-specialist | Replace hardcoded score values with `scoring_rules`; preserve defaults through seed/config; test admin-configured values affect issue lifecycle. | 0 |
| 6 | `td-observability` | devops-engineer | Structured JSON logs; request ID response propagation; cron/worker context propagation; PII masking; safe internal-error responses; SSE timeout route grouping. | 0; coordinate with 2 |
| 7 | `td-ci-supply-chain` | devops-engineer | Add CI lint/unit/E2E gates; `govulncheck`, Bun dependency audit, SBOM, secret scan; dependency update automation; replace deprecated `exportloopref`; no application behavior changes. | 0 |
| 8 | `td-api-contract` | api-designer + frontend | Make generated OpenAPI client the sole transport; remove fake SDK adapter; reconcile manual/generated `Issue`, `Tag`, pagination types; environment-based base URL; add drift/response validation. | 0; coordinate with 4 |
| 9 | `td-frontend-i18n` | frontend-specialist | Move API/modal/sync user strings to i18n; maintain `en`, `vi`, `zh` parity; extend guard to non-JSX runtime strings; no component redesign. | 0 |
| 10 | `td-frontend-a11y` | frontend-specialist | Fix dialog/drawer focus trap, Escape, restore focus, ARIA; accessible combobox keyboard model; icon button labels; re-enable Biome a11y rules. | 0; current `web/biome.json` changes must be preserved/reconciled |
| 11 | `td-frontend-architecture` | frontend-specialist | Split `App.tsx` by existing feature boundaries; remove duplicated state/types; avoid introducing a new abstraction or component library unless existing rules require it. | 8, 9, 10 |
| 12 | `td-test-quality-docs` | test-engineer + maintainer | Replace `internal/db/queries_test.go` error-swallowing smoke mock with behavior assertions/integration coverage; fix lint backlog; remove duplicate Playwright config; classify skipped E2E; add `README.md`; add `.env.example` only if not owned by 1; reconcile audit retention policy. | 1, 3, 7 |

## Agent execution contract

Each worktree gets one Paseo agent with `omp/9router/claude-sonnet-code`, full access, explicit file ownership. Agent prompt must contain:

- Read `.leedevkit/templates/CLAUDE.base.md` and applicable `.agent/rules/*` first.
- Inspect current callers before exported API/auth/type changes.
- Preserve unrelated user changes; never reset or clean the base checkout.
- Add only behavior-based regression coverage for changed boundaries.
- Do not run project-wide suites while siblings are active; run focused checks only.
- Commit only owned files with branch-specific message.
- Report changed files, security implications, focused verification, unresolved risks.

## Dispatch

Use Paseo worktree isolation. Create each branch from `b03fb5b`; do not stack branches. Dispatch wave 0 first. After baseline evidence is accepted, dispatch wave 1 (1–10) in parallel. Dispatch wave 2 (11) only after 8, 9, 10 are merged/rebased. Dispatch wave 3 (12) last.

Shared-file ownership is exclusive:

- `cmd/server/main.go`: security-config owns startup/config; migrations-readiness owns health/readiness; observability owns middleware/SSE. Later branches rebase after earlier merges and touch only their owned functions.
- `internal/auth/handler.go`: auth-hardening owns refresh/bootstrap; observability touches only audit/error serialization after auth rebase.
- `.env.example`: security-config owns it; test/docs verifies only.
- `web/biome.json`: frontend-a11y owns rule re-enable.
- Generated OpenAPI/SQLC output: api-contract or db-performance owns regeneration; never hand-edit elsewhere.

Each agent receives the exact prompt from `td-prompts/<worktree>.md`. Agents stop and report if a dependency is not merged, ownership overlaps, or behavior conflicts with `SPEC.md`.

```sh
paseo run --provider omp/9router/claude-sonnet-code --mode full \
  --new-workspace worktree --worktree-mode branch-off \
  --worktree-slug td-security-config --new-branch td/security-config --base b03fb5b \
  --title "TD security config" "$(cat td-prompts/security-config.md)"
```

Do not dispatch all 13 at once. Wave 0; wave 1 (1–10); wave 2 (11); wave 3 (12). Rebase shared-file branches immediately before implementation.

## Merge gates

1. Merge wave 0 evidence; reject stale findings.
2. Merge security/config, auth, migrations/readiness.
3. Merge DB performance and scoring.
4. Merge observability and CI.
5. Merge API contract, i18n, a11y.
6. Merge frontend architecture.
7. Merge test/docs cleanup.
8. Regenerate OpenAPI/SQLC artifacts only in their owning branch; never hand-edit generated files.
9. Run `./leedevkit test server --lint-only`, `./leedevkit test server --unit-only`, `./leedevkit test web --lint-only`, `./leedevkit test web --unit-only`, then `./leedevkit test all` on the integrated branch.
10. Perform targeted security smoke checks: missing secret refuses startup, bootstrap requires auth, revoked/reused refresh token fails, readiness fails when DB is unavailable, no token appears in URL/log output.

## Finding coverage

- Secret/default config/TLS/TTL: worktrees 1, 12.
- Bootstrap auth, query token, refresh rotation, audit PII: 2, 6.
- Migration versioning/rollback/readiness: 3, 12.
- N+1/export/scoring: 4, 5.
- Logging/request IDs/error leakage/rate-limit follow-up: 6. Rate limiter persistence is a separate decision: retain in-memory for single-instance LAN deployment, or create a new DB-backed slice only if multi-replica deployment is planned.
- CI/dependency/lint: 7, 12.
- API/type/base URL: 8.
- i18n/a11y/design architecture: 9, 10, 11.
- Test mocks/E2E/docs/retention/duplicate config: 12.
- Risks not promoted to implementation: upload ACL review, governance-rulebook mismatch, access-token blocklist semantics. Validate in wave 0; open separate worktrees only on confirmed exploit/requirement.

## Definition of done

All merged slices preserve existing API behavior except explicitly hardened security/config behavior, pass applicable focused checks plus the integrated LeeDevKit gates, include regression evidence for changed behavior, leave no unowned generated-file drift, and document accepted residual debt with owner and review trigger.
