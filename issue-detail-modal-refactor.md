# IssueDetailModal refactor

Status: Approved

## Goal
Reduce `web/src/pages/IssueDetailModal.tsx` from 2,512 lines to under 500 without changing UI behavior, permissions, API calls, keyboard/accessibility behavior, or parent-facing props.

## Current evidence
- `IssueDetailModal` owns state, effects, API mutations, AI flows, photo gallery, modal focus handling, and nearly all JSX in one function.
- Existing characterization coverage: `web/test/issueDetailModal.test.tsx`, 27 tests passing.
- Baseline checks: `./leedevkit test web --unit-only` and `./leedevkit test web --lint-only` pass.

## Proposed boundaries
Keep `IssueDetailModal.tsx` as the controller/composition root. Extract cohesive behavior; do not create a generic modal framework or change public contracts.

- `web/src/pages/issue-detail/types.ts` — local prop/callback/view-model types, tab/action/photo types.
- `web/src/pages/issue-detail/useIssueDetailAI.ts` — AI review, follow-up, translation/cache state and actions.
- `web/src/pages/issue-detail/useIssueDetailMutations.ts` — quick edits, responsibility/cause updates, resolve draft, close/reopen/invalid, delete/restore and reload-after-mutation recovery.
- `web/src/pages/issue-detail/useIssuePhotoGallery.ts` — photo list, preview index, zoom/pan, wheel/touch/mouse navigation, focus restoration, and gallery keyboard behavior.
- `web/src/pages/issue-detail/IssueDetailHeader.tsx` — title, category/location quick edits, action menu, close/edit controls, and tabs.
- `web/src/pages/issue-detail/IssueDetailMedia.tsx` — split slider, photo cards, error states, and gallery launch callbacks.
- `web/src/pages/issue-detail/IssueDetailSidebar.tsx` — description/AI panel, responsibility/cause sections, history, score breakdown, and action bar.
- `web/src/pages/issue-detail/IssueDetailConfirmation.tsx` — close/reopen/invalid/delete/restore confirmation drawer.
- `web/src/pages/issue-detail/IssuePhotoPreview.tsx` — fullscreen image preview and zoom/navigation controls.

## Tasks
- [ ] Extract shared local types/helpers first; preserve `IssueDetailModalProps` export behavior and all existing import paths.
- [ ] Move AI and mutation logic into domain hooks with explicit inputs/outputs; preserve server `allowed_actions` precedence, offline guards, conflict recovery, haptics, refresh, and close behavior.
- [ ] Move gallery state/effects and preview JSX; preserve focus trap/restore, Escape/arrows, zoom limits, swipe gestures, photo error behavior, and body-scroll locking.
- [ ] Extract header, media, sidebar, confirmation, and preview JSX as controlled components. Keep styling, translation keys, ARIA labels, and responsive layout unchanged.
- [ ] Compose extracted pieces in `IssueDetailModal.tsx`; remove obsolete inline code/imports. Main file must be below 500 lines; no compatibility shim or duplicate implementation remains.
- [ ] Update `web/test/issueDetailModal.test.tsx` only where extraction exposes a real behavior gap; retain behavior assertions rather than testing component internals or line counts.

## Test impact
Preserve: closed/open rendering, authoritative metadata and score logs, AI disabled/enabled flows, gallery navigation/error/zoom, assignment and cause verification, permission-denied states, status transitions, delete/restore, quick edits, and responsive action controls.

Boundary/failure cases: offline mutation blocking, stale-version conflicts and reload recovery, missing cause team, missing photos, failed media load, missing permissions, deleted issues, AI/API failures, Escape/focus restoration, and double-submit prevention.

## Done when
- `IssueDetailModal.tsx` is fewer than 500 lines.
- No user-visible behavior or public prop contract changes.
- Existing modal tests pass; any added tests assert observable behavior.
- `./leedevkit test web --lint-only` passes.
- `./leedevkit test web --unit-only` passes.
- `./leedevkit test all` passes before implementation is reported complete.
