# Fix Failed Web Unit Tests

Status: Awaiting approval

## Goal
Restore all 341 web unit tests to green without weakening behavior contracts or hiding state/API regressions.

## Root causes
- `web/src/api/client.ts` freezes `baseUrl` at module load and only strips `http://localhost` in Node SSR. Happy-DOM leaves `window` defined, so same-origin CSRF headers are skipped and mocked fetches receive absolute URLs.
- Zustand v5 SSR snapshots use stale `getInitialState()` after tests call `setState()`. `ProtectedRoute`, `StatusBar`, `CreateIssuePage`, and route rendering then see loading/guest/Vietnamese defaults instead of test state.
- Happy-DOM registration in shared fixtures permanently pollutes `window`, `document`, and `navigator`; `typeof window` branches stop distinguishing SSR tests.
- `WithMockState` replaces React's dispatcher globally and relies on positional `useState` slots. `wouterDashboardStates.test.tsx` is one slot short after `dashboardErrors` was added.
- Locale and dialog Zustand singletons leak between suites. `i18n.rendering.test.tsx` leaves locale `zh`; `modalPolicy.test.tsx` starts with an open dialog; `createIssueModal.validation.test.tsx` skips existing reset/cleanup fixtures.
- `S_CATEGORIES` and category translations are complete. Do not add duplicate translation data or change expected locale strings.

## Constraints and interfaces
- Keep `./leedevkit` and `./scripts/_bun.sh` as execution wrappers.
- Preserve cookie credentials, CSRF double-submit behavior, 401 refresh/deduplication, generated SDK `/api` base, and relative same-origin fetch contract.
- Prefer test-harness isolation fixes for test-only pollution. Do not make production code depend on test runner detection.
- Do not edit generated client files manually; regenerate only if the API contract changes.
- Keep tests behavior-based. Change assertions only when they contradict the canonical client or UI contract.

## Tasks

- [ ] **1. Normalize same-origin client requests.** Update `web/src/api/client.ts` so same-origin requests derive relative `pathname + search` regardless of whether Happy-DOM exposes `window`; compute origin from the request/environment consistently; retain absolute URLs only for genuinely cross-origin requests. Preserve CSRF header injection and 403 retry semantics. Verify with `test/client.test.ts`, `test/eventTicket.test.ts`, and `test/operations.test.ts`.

- [ ] **2. Stabilize SSR store reads.** Remove `typeof window`-based branches that select stale hook snapshots for SSR test rendering in `web/src/components/ProtectedRoute.tsx`, `web/src/components/StatusBar.tsx`, and `web/src/pages/CreateIssuePage.tsx`. Use a state access pattern that remains reactive in browser rendering while reflecting intentional store setup during SSR. Verify protected-route, status-bar, routing, dashboard, and i18n rendering tests.

- [ ] **3. Scope Happy-DOM lifecycle.** Update `web/test/createIssueModal.fixtures.tsx`, `web/test/issueDetailModal.fixtures.tsx`, and any equivalent fixture that calls `GlobalRegistrator.register()` so registration/cleanup is scoped to the DOM tests that need it. Audit teardown for `window`, `document`, `navigator`, `fetch`, and mounted roots. Verify SSR suites pass in the full Bun process, not only when run alone.

- [ ] **4. Remove dispatcher pollution from test state mocking.** Replace or tightly scope `WithMockState` in `web/test/fixtures/wouterTestHelpers.tsx`; restore the original React dispatcher in guaranteed teardown if temporary mocking remains. Prefer explicit test fixtures/props over positional internal-hook mocking. Update `wouterDashboardStates.test.tsx` for the current hook contract, including `dashboardErrors`, only where required by the tested state. Verify dashboard feed/state, routing, navigation, and status-bar suites.

- [ ] **5. Add deterministic singleton reset fixtures.** Add shared reset helpers or per-suite `beforeEach`/`afterEach` for `useAuthStore`, `useI18nStore`, `useDialogStore`, `globalThis.fetch`, `document.cookie`, `localStorage`, and mounted roots. Apply to `i18n.rendering.test.tsx`, `createIssuePage.test.tsx`, `modalPolicy.test.tsx`, `statusBar.test.tsx`, `protectedRoute.test.tsx`, `wouterRouting.test.tsx`, `appShell.test.tsx`, and `createIssueModal.validation.test.tsx`. Ensure unresolved dialog promises cannot cross tests.

- [ ] **6. Verify generated operation contract.** After client normalization, assert generated operations at the authenticated-fetch boundary as `/api/...` relative paths, while keeping `issueMutationPath()` assertions separate. Confirm JSON bodies, POST methods, error envelope mapping, AI suggestion URL, and tag review URL. Do not patch generated SDK output or weaken URL assertions.

- [ ] **7. Run targeted regression groups and fix only remaining causes.** Run API/client, auth/routing, dashboard, i18n/modal groups with the project wrapper. If failures remain, classify each as production behavior, fixture isolation, or stale expectation before editing. No broad assertion rewrites.

- [ ] **8. Run final gates.** Run `./leedevkit test web --unit-only`, `./leedevkit test web --lint-only`, then `./leedevkit test all`. Confirm server and E2E phases remain green.

## Done When

- [ ] `./leedevkit test web --unit-only` reports 341 passing tests and 0 failures.
- [ ] API tests prove relative same-origin URLs, CSRF headers, cookie credentials, refresh retry, refresh deduplication, and fresh event tickets.
- [ ] SSR tests prove authenticated, unauthenticated, capability-denied, locale-specific, dashboard, and modal states without order dependence.
- [ ] No global DOM, React dispatcher, Zustand, fetch, cookie, or locale state leaks across test files.
- [ ] Web lint and full project suite pass through `./leedevkit` wrappers.

## Review Focus

- Avoid assigning stale Zustand `getInitialState()` to current mutable state as a production shortcut unless verified against Zustand's SSR contract; prefer an explicit, maintainable store/test boundary.
- Ensure relative URL normalization does not rewrite cross-origin media or configured external API requests.
- Ensure Happy-DOM cleanup does not break browser-component tests that require a real DOM.
- Ensure dashboard fixture changes track actual hook order and do not create another positional dependency.
