# RBAC Administration UI

## Goal
Bổ sung giao diện Admin quản lý user, role, chuyền/khu vực, trạng thái hoạt động; giữ backend fail-closed, audit đầy đủ.

## Scope
- Admin-only user table: username, họ tên, nguồn auth, role, assigned location, active status.
- Bộ lọc role/location/status; loading, empty, error states.
- Chỉnh role, assigned location, active status qua form xác nhận.
- Không cho Admin tự khóa hạ quyền tài khoản cuối cùng; không sửa password AD.
- Không xây permission editor riêng: hệ thống hiện dùng 4 role cố định, permission matrix hiển thị dạng read-only.

## Tasks
- [ ] Chốt contract API: `GET /api/admin/users`, `PATCH /api/admin/users/{id}`; response envelope, pagination/filter, optimistic conflict, audit fields.
- [ ] Bổ sung handler/store/query cho list/update user; `RequireRole(ADMIN)` trước business logic; validate role/location; bảo vệ last active admin; audit state changes.
- [ ] Bổ sung test server: non-admin `403`, invalid role/location `400`, last-admin protection, successful update, audit record.
- [ ] Tạo `web/src/pages/UserAccessPage.tsx`: responsive table/cards, filters, role/location controls, confirmation, explainable errors.
- [ ] Thêm route `/admin/users`, link từ `StatusBar`/`AdminConfigPage`; chỉ render entry cho Admin, route vẫn server-protected.
- [ ] Thêm i18n VI/EN/ZH, keyboard focus, labels, `aria-live`, visible focus, skeleton, empty/error states.
- [ ] Smoke test UI trên mobile/desktop: list, filter, update, forbidden response, refresh persistence.
- [ ] Chạy `./leedevkit test server --lint-only`, `./leedevkit test server --unit-only`, `./leedevkit test web --lint-only`, `./leedevkit test web --unit-only`.

## Done When
- Admin quản lý được role, location, active status qua UI.
- Non-admin không đọc/sửa được endpoint.
- Không thể làm mất Admin hoạt động cuối cùng.
- Mọi thay đổi ghi audit log.
- UI đạt keyboard/WCAG states, test và smoke check pass.

## Assumptions
- Giữ 4 role hiện tại: `USER`, `LINE_LEADER`, `SAFETY_OFFICER`, `ADMIN`.
- Reuse bảng `users`, `locations`, API envelope, auth middleware, existing Admin styling.
- Pagination server-side nếu số user vượt ngưỡng; không thêm permission database hoặc dependency mới.
