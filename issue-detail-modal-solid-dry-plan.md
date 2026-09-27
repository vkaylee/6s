# IssueDetailModal SOLID/DRY refactor

Status: Awaiting approval

## Goal
Preserve current IssueDetailModal behavior while reducing controller coupling, separating domain responsibilities, and removing repeated UI/mutation/gesture logic.

## Current baseline
- `web/src/pages/IssueDetailModal.tsx`: 2 lines; public entrypoint only.
- `web/src/pages/issue-detail/useIssueDetailModal.tsx`: ~997 lines; owns state, effects, permissions, AI, translations, mutations, score logs, focus, body scroll, and photo state.
- `web/src/pages/issue-detail/IssueDetailSidebar.tsx`: ~696 lines; owns description, AI, assignment, cause verification, history, score, and action bar.
- Existing characterization coverage: `web/test/issueDetailModal.test.tsx`, 27 tests.
- No API, route, prop, permission, translation-key, or persistence contract changes allowed.

## Design decisions
- Keep `IssueDetailModal.tsx` as the stable public entrypoint.
- Keep feature-local modules under `web/src/pages/issue-detail/`.
- Use focused hooks for state/effects; use explicit narrow props for presentation components.
- Do not add generic framework abstractions. Extract only patterns used by this modal and at least two concrete call sites.
- Keep server `allowed_actions` authoritative; preserve offline guards, conflict recovery, haptics, refresh, focus restoration, keyboard handling, and existing styling.
- Keep mutation orchestration in hooks, not JSX components.

## Target structure

- `useIssueDetailState.ts`
  - Current issue synchronization and modal-local form/UI state.
  - Assignment, cause, confirmation, tab, edit-menu, and submit state.
- `useIssueDetailAI.ts`
  - AI availability, review, follow-up, translation cache, translation toggle, and suggestion application.
- `useIssueDetailMutations.ts`
  - Quick category/location edits, assignment/cause save, resolve draft, close/reopen/invalid, delete/restore, and reload-after-conflict.
- `useIssueDetailEffects.ts`
  - Online/offline listeners, member loading, score-log loading, modal body scroll, focus trap, action-menu outside click, and issue/photo error reset.
- `useIssuePhotoGallery.ts`
  - Photo list, preview selection, zoom/pan state, keyboard navigation, wheel/touch/mouse gesture behavior, and preview reset/close helpers.
- `IssueDetailViewModel.ts` or narrowed feature types in `types.ts`
  - Separate view models for header, media, sidebar sections, confirmation, and preview. Avoid passing the entire controller object to every component.
- Presentation slices:
  - `IssueDetailDescription.tsx`
  - `IssueDetailAssignment.tsx`
  - `IssueDetailHistory.tsx`
  - `IssueDetailScore.tsx`
  - `IssueDetailActionBar.tsx`
  - Keep `IssueDetailSidebar.tsx` as layout/composition only, ideally under 200 lines.

## Tasks

- [ ] Add characterization assertions only for behavior currently under-protected: mutation failure/recovery, focus restoration, offline mutation blocking, and photo gesture/keyboard boundaries. Do not test private hook structure or line counts.
- [ ] Extract controller state into `useIssueDetailState.ts`; preserve state reset semantics when `issue` or locale changes.
- [ ] Extract AI and translation flows into `useIssueDetailAI.ts`; preserve request payloads, follow-up limit, streaming display, cached translation behavior, and error dialogs.
- [ ] Extract issue mutations into `useIssueDetailMutations.ts`; preserve permission guards, `allowed_actions` precedence, expected versions, conflict reload, offline behavior, haptics, refresh, and close behavior.
- [ ] Extract browser/modal/photo effects into focused hooks; preserve Escape priority, Tab trapping, focus restoration, body-scroll restoration, outside-click closing, and score/member loading cancellation.
- [ ] Extract photo gallery state and shared gesture transitions; preserve zoom bounds, swipe thresholds, double-tap behavior, arrow navigation, and photo error behavior.
- [ ] Replace broad `view` props with narrow props or section-specific view models. Keep each component dependent only on data/actions it renders.
- [ ] Split `IssueDetailSidebar.tsx` into description, assignment, history, score, and action-bar components; retain current DOM semantics, labels, classes, and translation keys.
- [ ] Remove obsolete controller fields, duplicate handlers, imports, and dead files. Do not add compatibility aliases or duplicate implementations.
- [ ] Run focused modal tests, web lint/typecheck/unit tests, then `./leedevkit test all`. Resolve regressions before completion; do not claim completion if full suite fails.

## Test impact matrix

- Success: open/closed rendering, AI review, translation, assignment, cause verification, status transitions, delete/restore, photo preview.
- Boundaries: empty description, absent photos, missing assignment/member/team, no score logs, follow-up limit, zoom minimum/maximum, swipe thresholds.
- Negative: missing capabilities, server-denied `allowed_actions`, offline mutation, invalid delete reason, missing cause team.
- Failure: AI/API errors, media errors, version conflict, failed reload, member/score-log request failure.
- State: issue prop replacement, locale replacement, deleted/active projection, confirmation transitions, preview open/close, focus restore.
- Compatibility: unchanged `IssueDetailModal` import/export, props, API request shapes, translation keys, and test selectors.
- Accessibility: dialog focus trap, Escape behavior, keyboard tabs/arrows, ARIA roles/labels, and focus restoration.

## Done when

- `useIssueDetailModal.tsx` is removed or reduced to a thin composition hook; no hook owns unrelated AI, mutation, gallery, and browser-effect domains.
- `IssueDetailSidebar.tsx` is layout-only and under 200 lines.
- Presentation components do not receive the full controller view model unless every field is genuinely used.
- No duplicated gesture/mutation/reset implementation remains without a concrete reason.
- Existing behavior and public contracts remain unchanged.
- Focused modal tests pass.
- `./leedevkit test web --lint-only` passes.
- `./leedevkit test web --unit-only` passes.
- `./leedevkit test all` passes.

## Risks

- Hook extraction can alter effect dependency timing or state reset ordering.
- Narrow prop typing can expose hidden coupling currently masked by the broad view model.
- Gesture extraction can change stale-closure behavior; retain functional state updates and test boundary transitions.
- Full-suite E2E currently has an existing delete-menu selector mismatch risk; report exact result instead of weakening selectors or changing unrelated E2E behavior.
