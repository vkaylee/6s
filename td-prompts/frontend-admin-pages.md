# Target
Implement the existing request in `admin-page-split.md`. Own `web/src/pages/AdminConfigPage.tsx`, new `web/src/pages/FactoryLocationsPage.tsx`, new `web/src/pages/IssueTagsPage.tsx`, route/menu wiring in `web/src/App.tsx` and `web/src/components/StatusBar.tsx`, and three locale title keys. Backend unchanged. Start from baseline `80c37d4`; rebase onto integrated API/i18n/a11y branch before final merge, resolving only expected frontend conflicts.

# Change
Extract Locations and Tags tabs into admin-only routes/pages. Preserve CRUD behavior, existing API calls, loading/error states, and role guard. Keep AdminConfigPage with Scoring, AD, Notifications, AI; default Scoring. Add translated page titles to `en`, `vi`, `zh`. Reuse existing patterns; no new abstraction or component library.

# Acceptance
Admin can add/edit/toggle locations and tags at `/admin/locations` and `/admin/tags`. Non-admin sees no menu links and direct access is blocked. AdminConfigPage has exactly four tabs. Locale keys remain parity-safe. Focused frontend tests cover routes/role guard and locale keys. Run focused type/lint/tests; do not run full suite while integration branches are pending. Commit owned files only; report commit, files, checks, and conflicts.