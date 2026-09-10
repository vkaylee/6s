# Sprint 2 — Phân quyền, trạng thái lỗi, rollback

## Mục tiêu
Đồng bộ authorization backend/frontend; phân biệt empty state với failure; xác minh rollback production an toàn.

## Phạm vi

- [x] **Capability cho export/leaderboard** — `cmd/server/main.go`, permission catalog, UI guards
  - Routes now require `reports:view`; SPEC endpoints preserved.
  - Permission middleware denies missing capability before handler execution.
  - Existing web API tests cover authorized and 403 export paths.
- [x] **Dashboard error state/retry** — `web/src/hooks/useDashboardData.ts`, `ReportsPage.tsx`, các trang danh mục
  - Explicit per-resource failures; successful empty responses remain distinct.
  - Retry controls recover resources; refresh failures retain prior data.
  - Monotonic request IDs reject stale responses.
- [x] **Protected route denied state** — `web/src/components/ProtectedRoute.tsx`
  - Loading, unauthenticated redirect, forbidden states are distinct.
  - Forbidden state renders translated accessible alert and dashboard action.
- [x] **Migration rollback readiness** — migration runner và runbook hiện có
  - Runbook prohibits destructive down migrations in production.
  - Runner records checksums, uses advisory lock, and supports fix-forward/app rollback.
  - No applied migration modified.

## Verification

```sh
./leedevkit test server
./leedevkit test web
```

Evidence: server unit, integration, and lint passed; web unit, lint, and 5/5 Chromium E2E passed via `./leedevkit test all`. Authorization, retry/error, and rollback behavior reviewed against existing tests/runbook.

## Done when

- [x] Contract quyền được thống nhất backend/frontend.
- [x] Failure state có thông báo và retry đúng.
- [x] Quy trình rollback/fix-forward có bằng chứng; không mất dữ liệu.
