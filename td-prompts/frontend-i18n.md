# Target
Own locale JSON files, `web/src/api/client.ts` only for error codes, `web/src/pages/IssueDetailModal.tsx`, `CreateIssueModal.tsx`, `CreateIssuePage.tsx`, `web/src/App.tsx` string callsites, sync user-facing strings, and i18n tests. If API branch changes same files, rebase first and preserve its transport contract.

# Change
Move hardcoded Vietnamese/English user strings to `en`, `vi`, `zh`. Keep transport errors locale-neutral via stable codes; translate at UI. Extend guard to runtime alert/confirm/error literals without false positives. Maintain locale key parity.

# Acceptance
No user-facing hardcoded strings in owned paths. Three locales have identical keys. Existing flows show translated messages. Focused web tests/lint pass. Commit owned files only.