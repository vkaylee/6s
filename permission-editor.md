# Permission Editor — Design & Plan

## Goal
Thêm permission editor riêng cho Admin: quản lý ma trận `role → permission (resource:action)` động, thay thế hard-coded 4-role matrix trong SPEC 5.2, giữ backward compatibility và fail-closed.

## Key Decisions
1. **Granularity**: mỗi permission dạng `resource:action` (vd: `issue:create`, `issue:close_any`, `user:manage`). Không dùng `admin:all` (rule access-control.md).
2. **Model**:
   - Bảng `permissions` (code, description, is_system).
   - Bảng `role_permissions` (role, permission_code, PK composite).
   - Role vẫn là enum 4 giá trị hiện tại; KHÔNG thêm custom roles (YAGNI — scope này chỉ chỉnh ma trận của role có sẵn).
   - Seeding mặc định: map đúng ma trận SPEC 5.2.
3. **Safeguards**:
   - Chỉ Admin được sửa.
   - Khóa tối thiểu: ADMIN luôn giữ `user:manage`, `permission:manage` (chặn self-lockout khỏi màn editor).
   - Không cho xóa permission `is_system = true` khỏi role ADMIN.
   - Mọi thay đổi ghi `system_audit_logs` (old/new JSON).
   - Invalidate JWT? KHÔNG cần — evaluator đọc DB mỗi request qua context user (giống hiện tại), permission mới áp dụng ngay.
4. **Enforcement location**: handler layer qua helper `auth.HasPermission(ctx, code)`; middleware RequireRole giữ nguyên cho backward compat, code mới dùng permission check.

## Permission Catalog (v1)
| Code | Mô tả |
|---|---|
| `issue:create` | Tạo issue |
| `issue:view_all` | Xem toàn bộ issue |
| `issue:resolve` | Upload photo_after / resolve |
| `issue:close_own` | Đóng issue của mình |
| `issue:close_line` | Đóng issue thuộc chuyền mình |
| `issue:close_any` | Đóng mọi issue |
| `issue:close_safety` | Đóng issue 6S an toàn |
| `issue:reopen` | Mở lại issue |
| `issue:invalidate` | Bác bỏ issue |
| `scoring:manage` | Cấu hình điểm & hồi tố |
| `ad:manage` | Cấu hình AD/LDAP |
| `user:manage` | Quản lý user/role/location/active |
| `permission:manage` | Sửa ma trận quyền |
| `masterdata:manage` | Quản lý locations/tags |

## Tasks
- [ ] Task 1: Migration `000007_permissions.up/down.sql`: bảng `permissions`, `role_permissions`, seed data theo SPEC 5.2. → Verify: up/down chạy sạch, seed khớp ma trận.
- [ ] Task 2: sqlc queries + regenerate. → Verify: `sqlc generate` không lỗi.
- [ ] Task 3: `internal/auth/permission.go`: catalog constants, `HasPermission`, loader user→permissions (join role_permissions). → Verify: unit test evaluator fail-closed khi thiếu permission.
- [ ] Task 4: Wire loader vào `Middleware.Authenticate` context; helper `RequirePermission(code)`. → Verify: unit test middleware với user có/không permission.
- [ ] Task 5: API `GET /api/admin/permissions` (catalog + matrix), `PUT /api/admin/roles/{role}/permissions` (thay toàn bộ set, transaction, audit, last-admin-guard). → Verify: test 403 non-admin, 400 invalid code, 409 self-lockout, audit ghi đúng.
- [ ] Task 6: UI `web/src/pages/PermissionMatrixPage.tsx`: bảng role × permission với checkbox, dirty state, save confirm, explainable disabled cho ô khóa (ADMIN self-lockout guard). → Verify: render + i18n + test UI states.
- [ ] Task 7: Route `/admin/permissions` + link menu Admin. i18n VI/EN/ZH. → Verify: type-check, biome, bun test.
- [ ] Task 8: Migrate issue handlers sang `RequirePermission` thay `RequireRole` (close/reopen/invalid/patch — mapping theo role_permissions seed). → Verify: toàn bộ test auth/issue pass, hành vi không đổi với seed mặc định.
- [ ] Task 9: `./leedevkit test server --lint-only`, `--unit-only`; `./leedevkit test web --lint-only`, `--unit-only`. → Verify: 100% pass.

## Done When
- Admin sửa ma trận qua UI, thay đổi áp dụng ngay không cần re-login.
- Non-admin 403 trên mọi endpoint permission.
- Không thể tự khóa ADMIN khỏi `permission:manage`/`user:manage`.
- Mọi mutation audit log.
- Backward compatible: seed mặc định tái hiện đúng hành vi hard-code cũ; test cũ pass.
- Migration có down.sql sạch.

## Non-Goals (YAGNI)
- Custom roles, role inheritance, per-user permission override.
- Permission-level caching layer (DB query mỗi request đủ cho quy mô nhà máy).
- Export/import ma trận.
