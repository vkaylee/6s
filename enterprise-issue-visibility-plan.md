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

### Phase 1 — Completed backend data boundaries
- [x] **Export scope:** extended `ListIssuesForExportParams` with site, user, role, and location scope; enforced authenticated user; updated OpenAPI.
- [x] **Detail scope:** `GetIssueByID` enforces site and restricted visibility policy; rejects unauthorized access with not found.
- [x] **Attachment scope:** removed public static upload mounts; added authenticated `GET /api/issues/{id}/media/{folder}/{filename}` with path traversal and symlink escape protection.
- [x] **Event scope:** authenticated SSE stream re-checks issue visibility per event and suppresses unauthorized delivery.

### Phase 2 — Action-scope authorization and assignment (Next)
- [ ] **Policy domain:** create explicit action policy (`canRead`, `canAssign`, `canClaim`, `canUploadAfter`, `canClose`, `canReopen`, `canInvalidate`) with default deny.
- [ ] **Handler enforcement:** authorize incoming action in HTTP handler before service calls; verify actor and target site match.
- [ ] **Transactional re-check:** inside mutation transaction, verify issue site, status, version, and actor action-scope before applying changes.
- [ ] **Assignment mutations:** implement assign-to-team (`assigned_team_id`) and assign-to-user (`assignee_id`); reject cross-site targets; record audit logs.
- [ ] **Classification protection:** keep `6S` restricted; allow visibility overrides only through audited safety/admin actions.

### Phase 3 — Frontend workspaces and UX
- [ ] **Workspace state:** add workspace selector (`MY_WORK`, `SITE_FEED`, `RESTRICTED`) to `useDashboardData` and dashboard view.
- [ ] **Workspace queries:** map `MY_WORK` to user's creator/assignee/team scope, `SITE_FEED` to `SITE_PUBLIC`, `RESTRICTED` to safety view.
- [ ] **Issue presentation:** show assignment tags, visibility badge, and restricted indicators on `IssueCard` and `IssueDetailModal`.
- [ ] **Action gating:** hide or disable claim, resolve, close, reopen, and invalidate buttons when actor lacks action scope.
- [ ] **Translations and accessibility:** provide Vietnamese, English, and Chinese labels; include screen-reader friendly workspace cues.

### Phase 4 — Migration hardening and contract completion
- [ ] **Migration safety:** add verification queries for orphan references and backfill validation in test runner; keep rollback clean.
- [ ] **API documentation:** update OpenAPI specs for media, assignment mutations, and workspace filter parameters; update generated types.
- [ ] **Query tuning:** ensure indexes match workspace queries: `(site_id, visibility_class, created_at)` and `(site_id, assignee_id, status)`.

### Phase 5 — Full verification and release
- [ ] Add regression tests: cross-site access denial across list/detail/media/export/SSE; action-vs-read authorization matrix; assignment validation.
- [ ] Run `./leedevkit test server --lint-only` and `./leedevkit test server --unit-only`.
- [ ] Run `./leedevkit test web --lint-only` and `./leedevkit test web --unit-only`.
- [ ] Smoke-test login, workspace switching, media loading, assignment, and close flow across `USER`, `LINE_LEADER`, `SAFETY_OFFICER`, and `ADMIN`.

### Phase 6 — Dev-only legacy image compatibility (next)
- [ ] **Reproduce:** confirm legacy API responses still contain `/uploads/{folder}/{basename}` and verify files exist under configured `DATA_DIR`; capture expected 200 response in `DEV_INSECURE` only.
- [ ] **Dev route gate:** pass an explicit `allowLegacyUploads` flag from config; mount the old `/uploads/*` file server only when `DEV_INSECURE=true`. Never infer this from hostname or request headers.
- [ ] **Production fail-closed:** keep protected `/api/issues/{id}/media/...` as the canonical URL; when `DEV_INSECURE=false`, legacy `/uploads/*` must return 404 and must not expose directory contents.
- [ ] **Compatibility behavior:** preserve old basename paths for existing records in dev; new records continue returning protected media URLs. Do not migrate or duplicate image files.
- [ ] **Verification:** add route tests for dev 200, production 404, traversal rejection, and protected media authorization; run server lint/unit plus a dev smoke request against an existing image.
- [ ] **Cleanup:** remove legacy route after all dev fixtures/clients consume protected media URLs; document the removal condition in release notes.

## Dev image policy

- `DEV_INSECURE=true`: legacy `/uploads/*` compatibility allowed for local development only.
- `DEV_INSECURE=false`: no public uploads route; media requires authenticated issue-scoped endpoint.
- Production configuration MUST reject plaintext DB/HTTP independently; enabling legacy compatibility MUST NOT weaken those existing checks.
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
