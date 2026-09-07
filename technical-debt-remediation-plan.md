# 6S Technical Debt Remediation Plan

## Decision

One isolated Paseo worktree per **mergeable ownership slice**, not per symptom. One worktree per finding would create avoidable conflicts in `main.go`, auth handlers, SQL, and shared frontend types. Every confirmed debt remains mapped below. Baseline: commit `b03fb5b` on `master`; it preserves the user’s `admin-page-split.md` and includes the Biome scope fix.

The current checkout stays untouched during dispatch. Create every worktree from `b03fb5b`; only the integration owner merges branches. Agents commit only owned files. Never reset, stash, or overwrite unrelated user changes.

## Worktree matrix

| Order | Worktree / branch | Owner | Scope | Dependencies |
|---|---|---|---|---|
| 0 | `td-baseline-verification` | test-engineer | Baseline checks, finding confirmation; no edits. | none |
| 1 | `td-security-config` | security-auditor + backend | Fail-fast DB/JWT config, TLS, token TTL. | 0 |
| 2 | `td-auth-hardening` | security-auditor + backend | Bootstrap auth, query-token removal, atomic refresh rotation, reuse detection, PII masking. | 0; rebase after 1 |
| 3 | `td-migrations-readiness` | database-architect + backend | Versioned migrations, readiness/liveness, Docker healthcheck. | 0 |
| 4 | `td-db-performance` | database-architect | Remove N+1, bound export, regenerate SQLC. | 0 |
| 5 | `td-scoring-correctness` | backend-specialist | Read scoring rules from DB, seed defaults. | 0 |
| 6 | `td-observability` | devops-engineer | Structured logs, request IDs, safe errors, SSE grouping. | 0; rebase after 2, 3 |
| 7 | `td-ci-supply-chain` | devops-engineer | CI gates, dependency/security scans, lint freshness. | 0 |
| 8 | `td-api-contract` | api-designer + frontend | Generated transport/types, base URL, envelope validation. | 0 |
| 9 | `td-frontend-i18n` | frontend-specialist | Localize runtime/UI strings, locale guard. | 0; rebase after 8 |
| 10 | `td-frontend-a11y` | frontend-specialist | ARIA, focus, keyboard behavior, Biome rules. | 0 |
| 11 | `td-frontend-admin-pages` | frontend-specialist | Implement `admin-page-split.md`. | 8, 9, 10 |
| 12 | `td-frontend-architecture` | frontend-specialist | Split `App.tsx`, remove duplicated state/types. | 8, 9, 10, 11 |
| 13 | `td-test-quality-docs` | test-engineer + maintainer | Test mock, lint backlog, E2E skip, docs, retention. | 1, 3, 7 |

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

Create all worktrees from baseline `80c37d4`; do not stack branches. Current checkout remains untouched. Each agent receives the exact prompt in `td-prompts/<worktree>.md`, commits only owned files, runs focused checks, and reports commit/files/checks/risks.

Wave order:

1. Wave 0: baseline.
2. Wave 1: worktrees 1–10 in parallel. Shared files require rebase immediately before merge.
3. Wave 2: worktree 11, after API/i18n/a11y integration.
4. Wave 3: worktree 12, after worktree 11 integration.
5. Wave 4: worktree 13, after security/migration/CI integration.

Shared-file ownership: `cmd/server/main.go` is owned by security-config (startup), migrations-readiness (health), observability (middleware/SSE); `internal/auth/handler.go` by auth-hardening; `.env.example` by security-config; `web/biome.json` by frontend-a11y; generated OpenAPI/SQLC output only by their respective owners. Later branches rebase before touching shared files.

Example:

```sh
paseo run --provider omp/9router/claude-sonnet-code --mode full \
  --new-workspace worktree --worktree-mode branch-off \
  --worktree-slug td-security-config --new-branch td/security-config \
  --base 80c37d4 --title "TD security config" \
  "$(cat td-prompts/security-config.md)"
```

## Merge gates

Merge wave 0 evidence first. Then merge security/config, auth, migrations/readiness; DB/scoring; observability/CI; API/i18n/a11y; admin pages; architecture; test/docs. Rebase conflicts, regenerate generated artifacts only from source specs. Final integrated branch runs `./leedevkit test server --lint-only`, `./leedevkit test server --unit-only`, `./leedevkit test web --lint-only`, `./leedevkit test web --unit-only`, `./leedevkit test all`, plus targeted auth/readiness/token-leakage smoke checks.

## Finding coverage

Security/config: 1. Auth: 2. Migration/readiness: 3. N+1/export: 4. Scoring: 5. Observability: 6. CI/dependencies: 7. API/types: 8. i18n: 9. Accessibility: 10. Admin split: 11. App architecture: 12. Test/docs/retention: 13. Rate-limiter persistence, upload ACL, governance mismatch, and access-token blocklist remain wave-0 review risks; create new slices only if confirmed and scoped.

## Definition of done

All merged slices preserve behavior except explicit security hardening, pass applicable checks plus integrated gates, include regression evidence, leave no generated drift, and record accepted residual debt with owner and review trigger.
