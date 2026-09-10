# RBAC Hardening — Phần còn lại

## Mục tiêu
Hoàn thiện bảo vệ `SUPERADMIN`, atomic state changes, rollout an toàn; không mở rộng sang approval workflow/MFA.

## Phạm vi còn lại

- [ ] **Sửa invariant privileged accounts** — Tách `CountAdmins` thành `CountActiveAdmins` và `CountActiveSuperadmins`; cấm disable/hạ quyền `SUPERADMIN` cuối cùng; cập nhật setup/bootstrap để tạo `SUPERADMIN` đầu tiên.
  → Verify: migration + unit test giữ lại đúng một `SUPERADMIN` active.

- [ ] **Atomic user mutation** — Thêm transaction-capable store (`WithTx`/queries trên `*sql.Tx`) bao quanh update user + audit; rollback khi audit/update lỗi.
  → Verify: lỗi audit không đổi user; lỗi update không tạo audit; success tạo đúng một audit.

- [ ] **Session revocation consistency** — Đưa revoke refresh tokens vào cùng transaction khi cần; nếu hạ quyền/disable sau commit thất bại, trả lỗi rõ ràng hoặc rollback toàn bộ; không tạo trạng thái nửa thành công.
  → Verify: disable/role change revoke toàn bộ session; dependency failure không để mutation không kiểm soát.

- [ ] **Harden permission matrix policy** — Tách kiểm tra policy khỏi handler; chỉ `SUPERADMIN` sửa role mappings; bảo vệ permission hệ thống của `ADMIN` và toàn bộ permission `SUPERADMIN`; audit old/new atomic.
  → Verify: ADMIN 403; SUPERADMIN mutation success; lockout/escalation 409/403; audit rollback.

- [ ] **Bootstrap/LDAP/API contract cleanup** — Không cho AD group thông thường provision `SUPERADMIN`; cập nhật `CreateLocalAdmin`, LDAP mapping, OpenAPI error codes, generated client; thêm down migration an toàn cho dev.
  → Verify: AD login không nâng lên `SUPERADMIN`; API contract drift pass; migration forward/reconciliation pass.

- [ ] **Frontend capability correctness** — Dùng capability/role từ server, không chỉ so sánh role cục bộ; xử lý 403/409, stale list, concurrent update; không hiển thị thao tác trái quyền.
  → Verify: ADMIN thấy user thường; không thấy privileged controls; stale mutation hiển thị lỗi, không cập nhật optimistic sai.

- [ ] **Regression/security verification** — Bổ sung test authorization, persistence, rollback, migration, compatibility; chạy server/web gates và smoke test bằng hai role.
  → Verify: `./leedevkit test server`, `./leedevkit test web`, OpenAPI drift, migration reconciliation.

## Thứ tự triển khai

1. Invariant + bootstrap.
2. Transaction store/query.
3. User update + revoke + audit.
4. Permission matrix policy.
5. LDAP/API/UI cleanup.
6. Regression tests.
7. Full verification.

## Done when

- Không thể mất `SUPERADMIN` active cuối cùng.
- User mutation, audit, session state không lệch nhau.
- AD không thể cấp `SUPERADMIN` ngoài bootstrap được kiểm soát.
- ADMIN không quản trị tài khoản/quyền đặc quyền.
- Migration, API, UI, tests đồng nhất.
