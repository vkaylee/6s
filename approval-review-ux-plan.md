# Approval Review UX

Status: Approved

## Goal
Hide unavailable approval actions and explain exactly why an issue cannot be reviewed.

## Constraints and Interfaces
- `currentIssue.allowed_actions.close` is authoritative when present; client capabilities never re-grant a server-denied action.
- Backend authorization remains unchanged and mandatory.
- Preserve current close/reopen behavior for authorized reviewers.
- Use existing i18n, Lucide icons, touch-safe layout, and project wrappers.

## Tasks
- [x] Add localized copy for unavailable review, self-review, and Safety permission states.
- [x] Replace disabled approval/reopen buttons with a readable status panel when `allowed_actions.close` is false.
- [x] Keep both actions visible and enabled only when the server allows close; retain loading disable during submission.
- [x] Add regression coverage for generic denial, self-review denial, and authorized approval.
- [x] Run web unit/lint checks and inspect the responsive modal surface.

## Done When
- [x] Unauthorized users see no misleading approval CTA.
- [x] Users see a specific reason: self-resolver, Safety permission, line scope, or generic reviewer restriction.
- [x] Authorized users retain working Duyệt đạt/Mở lại actions.
- [x] Backend remains the final authorization boundary.
