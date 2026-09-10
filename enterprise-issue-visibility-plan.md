# Enterprise Issue Visibility

## Goal
Implement site-isolated, policy-based issue visibility with team/person assignment and restricted safety data.

## Decisions
- `SITE_PUBLIC`: 1S–5S, readable by authenticated users in the same site.
- `SAFETY_RESTRICTED`: 6S or explicitly sensitive; readable by safety/admin, responsible leader scope, creator, assignee, and assigned-team members.
- `ADMIN` and `SUPERADMIN`: full access within governed sites; cross-site access requires explicit capability.
- Read scope differs from action scope. Client filters only narrow results.
- `assignee_id` plus `assigned_team_id`; `resolver_id` remains the actual uploader.

## Implementation sequence

### Phase 1 — Close backend data-boundary gaps
- [ ] **Export scope:** extend `ListIssuesForExportParams` with authenticated site/user/role/location; apply the identical visibility predicate; update report handler/service and OpenAPI.
- [ ] **Detail scope:** keep `GetIssueByID` restricted; add negative tests for cross-site and restricted non-member access; remove any internal-context bypass reachable from HTTP.
- [ ] **Attachment scope:** replace public `/uploads` mount with authenticated issue-media handler; resolve issue by ID, authorize visibility, validate basename; preserve storage path isolation.
- [ ] **Event scope:** filter SSE events by subscriber site and issue visibility; avoid broadcasting restricted issue IDs/content to unauthorized clients; add unsubscribe/slow-consumer behavior tests.

### Phase 2 — Enforce action scope
- [ ] Add explicit policy functions for `read`, `assign`, `claim`, `upload`, `close`, `reopen`, `invalidate`; default deny.
- [ ] Enforce action checks in handlers before services; re-check issue site/status/version inside mutation transactions.
- [ ] Add assignment API using `assigned_team_id`/`assignee_id`; require same-site active targets; audit every assignment and visibility-class change.
- [ ] Ensure `6S` always remains restricted unless an authorized safety/admin workflow changes classification with audit.

### Phase 3 — Complete API and persistence contract
- [ ] Add migration reconciliation checks: orphan site/team/user references, cross-site assignments, null/invalid visibility values; keep rollback safe and non-destructive.
- [ ] Update `openapi.yaml`, generated client types, request/response DTOs, sync payload compatibility, and export schema.
- [ ] Add indexes/query plans for `(site_id, visibility_class, created_at)`, assignee, team, membership; verify bounded pagination.

### Phase 4 — Frontend workspaces
- [ ] Add default `Cần tôi xử lý`: creator, assignee, team membership, leader location, unresolved/review-needed states.
- [ ] Add `Hiện trường chung`: same-site `SITE_PUBLIC` feed; preserve server filtering, client filters only narrow results.
- [ ] Add `An toàn hạn chế`: visible only with restricted scope; show safe empty/forbidden states without leaking issue existence.
- [ ] Display assignment, visibility, and restricted indicators; hide unauthorized actions; maintain keyboard/screen-reader labels and i18n in `vi`, `en`, `zh`.

### Phase 5 — Verification and release
- [ ] Add behavior tests: same-site public read; cross-site denial; restricted creator/assignee/team/leader access; unauthorized denial; action/read separation; export/media/SSE leakage.
- [ ] Add migration tests: fresh install, legacy backfill, rollback, mixed-version additive client behavior, cross-site trigger rejection.
- [ ] Run `./leedevkit test server --lint-only` and `./leedevkit test server --unit-only`.
- [ ] Run `./leedevkit test web --lint-only` and `./leedevkit test web --unit-only`.
- [ ] Smoke-test authenticated role/site matrix, attachment access, export, and live events.

## Dependencies

1. Phase 1 before Phase 5 security verification.
2. Phase 2 before exposing assignment controls in Phase 4.
3. Phase 3 before regenerating or releasing API clients.
4. Phase 4 after backend contracts stabilize.

## Done When

- No cross-site or restricted issue leakage through list, detail, export, attachments, or events.
- Assignment/action policy enforced server-side; UI is only a usability layer.
- Legacy data migration reversible; audit trail complete.
- Three workspaces operate with authorized empty/forbidden states.
- All wrapper lint, unit, migration, and smoke checks pass.
