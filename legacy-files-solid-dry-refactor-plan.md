# Legacy Files SOLID/DRY Refactoring Plan

Status: Approved

## Goal
Decompose all 16 legacy files exceeding 500 lines down to `<= 500` lines (target `< 300` lines each) using SOLID and DRY principles, eliminating code duplication between duplicate pages/modals, separating concerns, and ratcheting down `web/.max-lines-baseline.json` until empty.

## Current Baseline & Target Inventory

| Priority | Target File | Lines | Root Causes & SOLID/DRY Violations | Refactored Destination (< 500 lines) |
|---|---|---|---|---|
| **Wave 1** | `src/pages/CreateIssuePage.tsx`<br>`src/pages/CreateIssueModal.tsx` | 1,190<br>610 | **Violates DRY & SRP**: Both duplicate 85% of issue creation form logic, photo compression/attachment handling, IndexedDB draft saving, category/tag selection, and submission pipelines. | `src/pages/create-issue/`<br>• `useIssueForm.ts` (~250 lines)<br>• `IssueCategorySection.tsx`<br>• `IssueMediaAttachments.tsx`<br>• `IssueTaxonomySection.tsx`<br>• `CreateIssuePage.tsx` (< 200 lines)<br>• `CreateIssueModal.tsx` (< 150 lines) |
| **Wave 2** | `src/pages/AdminConfigPage.tsx` | 1,221 | **Violates SRP**: 5 completely independent system domains combined into a single file with monolithic API handling and inline forms. | `src/pages/admin-config/`<br>• `ScoringConfigSection.tsx`<br>• `ActiveDirectoryConfigSection.tsx`<br>• `NotificationConfigSection.tsx`<br>• `AIConfigSection.tsx`<br>• `TimezoneConfigSection.tsx`<br>• `AdminConfigPage.tsx` (orchestrator < 150 lines) |
| **Wave 3** | `src/pages/ReportsPage.tsx` | 1,505 | **Violates SRP & ISP**: Manages KPI calculation, XLSX export stream, fullscreen DOM events, drilldown modal, category breakdowns, and team comparison charts in one place. | `src/pages/reports/`<br>• `useReportsData.ts`<br>• `ReportsKpiSummary.tsx`<br>• `ReportsDrilldownModal.tsx`<br>• `ReportsExportAction.ts`<br>• `ReportsMeetingTab.tsx`<br>• `ReportsPage.tsx` (< 250 lines) |
| **Wave 4** | `src/App.tsx` | 894 | **Violates SRP**: Router declarations, navigation sidebar/bottom bar, offline synchronization banners, service worker update triggers, layout wrapper all in one root. | `src/layout/`<br>• `AppRoutes.tsx`<br>• `AppNavigation.tsx`<br>• `AppSyncBanner.tsx`<br>• `AppLayout.tsx`<br>• `App.tsx` (< 150 lines) |
| **Wave 5** | `src/pages/IssueTagsPage.tsx`<br>`src/pages/TeamManagementPage.tsx`<br>`src/components/TaxonomySelectorModal.tsx` | 838<br>658<br>572 | **Violates SRP & DRY**: Multiple modal forms and card components inlined inside page definitions; duplicated taxonomy badge rendering and filtering. | `src/pages/issue-tags/` (`TagCard.tsx`, `CreateTagModal.tsx`)<br>`src/pages/team-management/` (`TeamCard.tsx`, `TeamScopeModal.tsx`)<br>`src/components/taxonomy/` (`useTaxonomySelection.ts`) |
| **Wave 6** | `src/components/ImageAnnotatorModal.tsx`<br>`src/pages/UserAccessPage.tsx`<br>`src/components/AIReviewPanel.tsx` | 662<br>507<br>505 | Canvas geometric math mixed with canvas rendering; user access filters mixed with edit modals; AI stream buffers mixed with suggestion cards. | `useCanvasDrawing.ts` + `CanvasToolbar.tsx`<br>`UserRoleTable.tsx`<br>`AISuggestionCard.tsx` |
| **Wave 7** | Test suites:<br>`test/issueDetailModal.test.tsx` (1,370)<br>`test/wouterRouting.test.tsx` (792)<br>`test/reportsPage.test.tsx` (630)<br>`test/createIssueModal.test.tsx` (585)<br>`test/i18n.test.tsx` (521) | 3,898 | Monolithic test suites testing 15+ sub-scenarios in single files with redundant DOM mounting helpers. | Split into scenario-specific suites (`.state.test.tsx`, `.mutations.test.tsx`, `.permissions.test.tsx`) sharing fixture helpers in `test/fixtures/`. |

---

## SOLID & DRY Refactoring Principles

1. **Single Responsibility Principle (SRP)**:
   - Pages and modals must only orchestrate routing and layout.
   - Form state, network queries, and side effects belong in dedicated hooks (`useIssueForm`, `useReportsData`, `useAdminConfig`).
   - Complex sub-views (tabs, dialogs, charts) belong in dedicated feature subcomponents.
2. **Open-Closed Principle (OCP)**:
   - Dynamic tab panels (e.g. `AdminConfigPage` tabs, `ReportsPage` views) render through modular registries rather than a giant conditional switch in JSX.
3. **Liskov Substitution & Interface Segregation (LSP/ISP)**:
   - Extracted components take narrowed props specific to their needs (`IssueMediaAttachmentsProps`, `KpiSummaryProps`), eliminating giant bag-of-props passing.
4. **Don't Repeat Yourself (DRY)**:
   - Unify duplicated issue creation logic (`CreateIssuePage` and `CreateIssueModal`) under a single cohesive headless hook (`useIssueForm`) and shared presentation pieces.
   - Reusable canvas math in `ImageAnnotatorModal` extracted to pure helper functions with unit test coverage.
5. **Ratcheting Policy**:
   - Each time a file is refactored below 500 lines, remove it completely from `web/.max-lines-baseline.json`.
   - Never allow any touched file to increase in line count.

---

## Tasks & Execution Waves

### Wave 1: CreateIssue Unification (DRY & SRP)
- [ ] Task 1.1: Extract shared issue form hook `web/src/pages/create-issue/useIssueForm.ts` containing draft saving, photo compression, tag toggles, and form submission.
- [ ] Task 1.2: Extract shared presentation subcomponents (`IssueCategorySection.tsx`, `IssueMediaAttachments.tsx`, `IssueTaxonomySection.tsx`).
- [ ] Task 1.3: Refactor `CreateIssuePage.tsx` and `CreateIssueModal.tsx` to consume shared hook and subcomponents; verify both are `< 250` lines.
- [ ] Task 1.4: Remove `CreateIssuePage.tsx` and `CreateIssueModal.tsx` from `.max-lines-baseline.json`. Verify with `./leedevkit test web --lint-only` and unit tests.

### Wave 2: AdminConfigPage Domain Separation (SRP)
- [ ] Task 2.1: Extract `ScoringConfigSection.tsx`, `ActiveDirectoryConfigSection.tsx`, `NotificationConfigSection.tsx`, `AIConfigSection.tsx`, and `TimezoneConfigSection.tsx` under `web/src/pages/admin-config/`.
- [ ] Task 2.2: Refactor `AdminConfigPage.tsx` as a thin tab orchestrator `< 150` lines.
- [ ] Task 2.3: Remove `AdminConfigPage.tsx` from `.max-lines-baseline.json`. Verify with `bun test test/adminConfigPage.test.tsx` and lint.

### Wave 3: ReportsPage Modularization (SRP & ISP)
- [ ] Task 3.1: Extract report data queries, summary metrics, and drilldown state into `useReportsData.ts`.
- [ ] Task 3.2: Extract `ReportsKpiSummary.tsx`, `ReportsDrilldownModal.tsx`, and `ReportsMeetingTab.tsx`.
- [ ] Task 3.3: Refactor `ReportsPage.tsx` down to `< 250` lines and remove from baseline. Verify with `bun test test/reportsPage.test.tsx`.

### Wave 4: App Shell Decomposition
- [ ] Task 4.1: Split `App.tsx` into layout, route declarations, and navigation controls.
- [ ] Task 4.2: Ensure `App.tsx` `< 200` lines and remove from baseline. Verify with `bun test test/wouterRouting.test.tsx`.

### Wave 5: Masterdata Management & Taxonomy
- [ ] Task 5.1: Split `IssueTagsPage.tsx` into `TagCard.tsx` and `CreateTagModal.tsx`.
- [ ] Task 5.2: Split `TeamManagementPage.tsx` into `TeamCard.tsx` and `TeamScopeModal.tsx`.
- [ ] Task 5.3: Extract taxonomy search and filter logic from `TaxonomySelectorModal.tsx`.
- [ ] Task 5.4: Remove from baseline and verify.

### Wave 6: Canvas & Component Refinements
- [ ] Task 6.1: Extract canvas interaction math (`getShapeBounds`, `findResizeHandleAtPoint`, `redraw`) from `ImageAnnotatorModal.tsx` into pure utility functions.
- [ ] Task 6.2: Refactor `UserAccessPage.tsx` and `AIReviewPanel.tsx` below 500 lines.
- [ ] Task 6.3: Remove from baseline and verify.

### Wave 7: Test Suite De-duplication & Splitting
- [ ] Task 7.1: Extract shared mock setup and DOM render helpers into `web/test/helpers/`.
- [ ] Task 7.2: Split `issueDetailModal.test.tsx`, `wouterRouting.test.tsx`, and `reportsPage.test.tsx` into cohesive scenario files.
- [ ] Task 7.3: Remove test files from baseline once all files in repository satisfy `<= 500` lines. Baseline file becomes empty or eliminated.

---

## Verification Gates (Every Wave)

1. **Lint & Line-count Check**:
   ```sh
   ./leedevkit test web --lint-only
   ```
2. **Focused Unit Tests**:
   ```sh
   ./scripts/_bun.sh test test/<relevant_test>.test.tsx
   ```
3. **Full Suite Regression**:
   ```sh
   ./leedevkit test all
   ```

## Done When
- [ ] All target source files in `web/src/` and `web/test/` are `<= 500` lines.
- [ ] `web/.max-lines-baseline.json` has `0` entries.
- [ ] All existing public component exports, props, and behaviors remain 100% backward compatible.
- [ ] `./leedevkit test all` passes completely with zero regressions.
