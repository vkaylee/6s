# Admin RBAC Hardening

## Goal
Tách `SUPERADMIN` khỏi `ADMIN`; ngăn leo thang quyền, tự khóa tài khoản, mất audit; giữ tương thích dữ liệu hiện hữu.

## Quyết định
- `SUPERADMIN` là role quản trị cao nhất.
- Chỉ `SUPERADMIN` được sửa/disable/promote/demote `ADMIN` hoặc sửa ma trận quyền.
- `ADMIN` được quản lý `USER`, `LINE_LEADER`, `SAFETY_OFFICER`; không sửa target `ADMIN`/`SUPERADMIN`.
- Không ai tự disable, tự hạ quyền, hoặc tự cấp quyền cao hơn.
- Không được disable/hạ quyền `SUPERADMIN` cuối cùng.
- `SUPERADMIN` kế thừa toàn bộ quyền hiện có; không thêm workflow hai người phê duyệt ở đợt này.
- Revoke session sau commit; mutation user + audit phải atomic.

## Tasks
- [ ] Mở rộng role contract: thêm `SUPERADMIN` vào Go enum, DB checks, sqlc queries, OpenAPI, generated client types.
- [ ] Viết migration role: cập nhật checks `users`/`role_permissions`, promote admin đầu tiên thành `SUPERADMIN`, giữ các admin còn lại là `ADMIN`, seed quyền mặc định.
- [ ] Tách capability policy: tạo policy thuần kiểm tra actor-target-action; default deny; áp dụng cho user update, permission update, admin routes.
- [ ] Bảo vệ user mutation backend: chặn self-change, target privileged, privilege escalation, last active superadmin; trả mã lỗi ổn định.
- [ ] Làm update user atomic: transaction bao quanh user update + audit; revoke refresh sessions sau commit; không nuốt lỗi/audit gap.
- [ ] Cập nhật frontend: capabilities từ server/auth context; ẩn control không được phép; hiển thị role `SUPERADMIN`, confirmation, lỗi policy.
- [ ] Cập nhật LDAP/JIT: chỉ mapping role nghiệp vụ; không provision `SUPERADMIN` từ group AD thông thường; bootstrap/promote qua local-controlled path.
- [ ] Thêm regression tests: admin-to-admin 403, superadmin actions, self-disable/self-demote, last-superadmin, privilege escalation, audit rollback, session revoke.
- [ ] Verification: `./leedevkit test server --lint-only`, `./leedevkit test server --unit-only`, `./leedevkit test web --lint-only`, `./leedevkit test web --unit-only`; smoke test permission matrix/user admin.

## Done When
- ADMIN không thể sửa hoặc disable ADMIN/SUPERADMIN.
- SUPERADMIN quản trị được ADMIN.
- Không mất superadmin active cuối cùng.
- Không có mutation thành công thiếu audit.
- API, UI, LDAP, migration, tests đồng nhất.
