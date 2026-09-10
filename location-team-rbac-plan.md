# Location & Team Scope RBAC Plan

## Goal
Cho phép một khu vực có nhiều người và nhiều team phụ trách; một user quản lý nhiều khu vực; report/export luôn bị giới hạn bởi site và assignment scope.

## Decisions cố định

- Database: PostgreSQL hiện hữu; migration kế tiếp là `000016_location_scope.up.sql` / `.down.sql`.
- `users.assigned_location_code` giữ nguyên trong Phase 1 để tương thích dữ liệu cũ; không dùng cho authorization mới. Không xóa cột cho đến khi có migration cutover riêng.
- Một user có thể thuộc nhiều location. `responsibility_type` gồm `OWNER`, `BACKUP`, `REVIEWER`; mặc định backfill là `OWNER`.
- Một team có thể phụ trách nhiều location; một location có thể có nhiều team.
- Issue vẫn có tối đa một `assigned_team_id` và một `assignee_id`; assignment không tự động suy ra từ location membership.
- `reports:view` và `reports:export` là hai permission độc lập.
- `LINE_LEADER`: scope là location membership còn hiệu lực hoặc team membership + team-location assignment còn hiệu lực. `SAFETY_OFFICER`: toàn site. `ADMIN`: toàn site. `SUPERADMIN`: toàn hệ thống theo cơ chế hiện tại.
- Client filter chỉ thu hẹp scope; backend luôn tính scope từ authenticated user. Cross-site reference trả `404` hoặc `403` theo convention hiện hữu, không tiết lộ dữ liệu.

## Tasks

- [ ] **Migration `000016_location_scope`** — tạo `location_memberships(location_code VARCHAR(50), user_id BIGINT, responsibility_type VARCHAR(20), valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, valid_to TIMESTAMPTZ NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by BIGINT NULL, PRIMARY KEY (location_code, user_id), FK location/user/site-safe, CHECK type, CHECK valid_to > valid_from)`; tạo `team_locations(team_id BIGINT, location_code VARCHAR(50), created_at TIMESTAMPTZ, created_by BIGINT NULL, PRIMARY KEY (team_id, location_code))`; thêm index theo `user_id`, `location_code`, `team_id`; backfill active `users.assigned_location_code` thành `OWNER`. Verify: migration up/down trên DB test; backfill không tạo duplicate/cross-site row.
- [ ] **SQL queries `sql/queries.sql`** — thêm list/insert/deactivate location memberships, list/attach/detach team locations, scope query trả distinct location codes cho `(user_id, site_id)`; mọi join kiểm tra cùng `site_id`; chạy `./scripts/_sqlc.sh generate`. Verify: generated `internal/db/queries.sql.go` biên dịch; test scope gồm location trực tiếp, location qua team, expired/inactive membership, khác site.
- [ ] **Auth scope package `internal/auth/`** — thêm helper/query-backed scope model: `LocationScope(ctx, user)` hoặc equivalent, `CanAccessLocation`, `CanManageLocation`; fail closed khi thiếu user, site, membership hoặc query lỗi; giữ permission check ở handler, scope check trước service. Verify: unit tests `LINE_LEADER` đúng/sai scope, `SAFETY_OFFICER` toàn site, inactive/expired bị từ chối, cross-site bị từ chối.
- [ ] **Issue authorization callers `internal/issue/`, `cmd/server/main.go`** — thay mọi check `assigned_location_code` dùng cho authorization bằng scope helper/SQL; giữ `assigned_location_code` chỉ cho admin display/backward compatibility; không thay đổi quyền `6S` của `SAFETY_OFFICER`/`ADMIN`; assignment issue phải kiểm tra assignee/team cùng site và ghi audit như contract hiện tại. Verify: existing issue tests pass; thêm regression cho leader có nhiều location và leader qua team.
- [ ] **Report scope `internal/report/`, `sql/queries.sql`** — đổi service/store contract nhận authenticated scope (`user_id`, `site_id`, role, permitted locations/teams) thay vì chỉ `locationCode`; `GetSummary` và `GetExportData` bắt buộc áp dụng scope server-side; query location cụ thể chỉ là intersection với permitted locations; `USER` không qua route permission. Verify: leader không đọc/export location ngoài scope; safety/admin đọc toàn site; empty scope trả dữ liệu rỗng, không phải toàn bộ site.
- [ ] **Permission split `internal/auth/permission.go`, migration `000017_report_export_permission.up.sql`** — thêm `PermissionReportsExport = "reports:export"`; cập nhật catalog; cấp `reports:export` cho `LINE_LEADER`, `SAFETY_OFFICER`, `ADMIN`, `SUPERADMIN` theo policy; route `/api/reports/summary` dùng `reports:view`, `/api/issues/export` dùng `reports:export`; cập nhật down migration. Verify: authenticated user thiếu permission nhận `403` trước service; OpenAPI security/permission notes cập nhật.
- [ ] **Admin assignment API `internal/admin/`, `cmd/server/main.go`, `openapi.yaml`** — thêm endpoints: `GET /api/admin/locations/{code}/members`, `PUT /api/admin/locations/{code}/members/{userID}` body `{responsibility_type, valid_from, valid_to}`, `DELETE /api/admin/locations/{code}/members/{userID}`, `GET /api/admin/teams/{id}/locations`, `PUT /api/admin/teams/{id}/locations/{code}`, `DELETE /api/admin/teams/{id}/locations/{code}`; Admin-only via `user:manage`; validate same-site, active user/team/location, date range; response dùng envelope hiện hữu; state changes ghi `system_audit_logs` với old/new values. Verify: 400 validation, 403 non-admin, 404 cross-site/not found, 409 duplicate/conflict, success + audit.
- [ ] **Admin UI `web/src/pages/UserAccessPage.tsx` và API client** — hiển thị nhiều location/team memberships, responsibility, effective dates; thêm/xóa có confirmation; không expose cột legacy như nguồn phân quyền; report location dropdown chỉ nhận permitted locations. Verify: keyboard labels, loading/empty/error states, add/remove persistence, non-admin hidden route plus server 403.
- [ ] **Contract/docs cập nhật** — đồng bộ `SPEC.md`, `openapi.yaml`, permission matrix, role/runbook; ghi rõ migration order, rollback limitation, legacy column policy. Verify: OpenAPI parse/check; không còn tài liệu nói Line Leader chỉ có một location.
- [ ] **Verification** — chạy `./leedevkit test server --lint-only`, `./leedevkit test server --unit-only`, `./leedevkit test web --lint-only`, `./leedevkit test web --unit-only`, sau đó E2E auth matrix: USER, leader direct, leader via team, safety, admin; report summary/export cross-scope. Verify: toàn bộ pass; không có unauthorized query chạm business service.

## Done When

- Một location gán được nhiều user, nhiều team; một user quản lý nhiều location.
- Authorization không còn phụ thuộc `users.assigned_location_code`.
- Report view/export tách permission, lọc đúng site và scope.
- Assignment API có validation, audit, rollback-safe migration.
- Existing issue behavior giữ nguyên ngoài phần scope được mở rộng.
- Server, web, OpenAPI, migration, unit và E2E checks pass.
