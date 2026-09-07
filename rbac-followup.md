# RBAC Follow-up Plan

## Goal
Đưa permission editor thành nguồn phân quyền thực tế, sửa lỗi type-check, bảo đảm audit/migration an toàn.

## Tasks
- [ ] Migrate authorization trong `internal/issue/service.go`: thay role hard-code bằng permission evaluator/policy context cho close, reopen, invalidate, patch; giữ các ràng buộc nghiệp vụ creator/resolver/location/category. → Verify: seed mặc định giữ nguyên hành vi SPEC; matrix thay đổi làm thay đổi quyền thực tế.
- [ ] Audit toàn bộ admin routes trong `cmd/server/main.go`: thay `RequireRole(ADMIN)` bằng permission tương ứng (`ad:manage`, `user:manage`, `masterdata:manage`, `scoring:manage`, `permission:manage`); giữ `RequireRole` chỉ cho bootstrap/compatibility khi cần. → Verify: mỗi route có test non-permission `403`.
- [ ] Sửa `web/src/pages/IssueDetailModal.tsx`: thêm import `apiClient`, khai báo response types cho callback implicit `any`; không đổi hành vi. → Verify: `bun x tsc --noEmit` không còn lỗi.
- [ ] Làm permission update atomic với audit: transaction bao quanh replace mappings + audit insert; audit lỗi phải rollback mutation; không nuốt lỗi. → Verify: success có audit; audit failure không đổi mappings.
- [ ] Chuẩn bị migration rollout: backup DB, chạy `000009_permissions.up.sql` qua migration runner, không chạy down trong production; định nghĩa rollback bằng restore/roll-forward. → Verify: migration idempotent, schema/index/FK đúng.
- [ ] Xác minh production mappings: đếm 14 permissions, 32 default role mappings; kiểm tra ADMIN giữ `permission:manage` + `user:manage`; đối chiếu SPEC 5.2. → Verify: reconciliation query pass, không có orphan/duplicate.
- [ ] Chạy `./leedevkit test server`, `./leedevkit test web`, smoke test permission matrix + issue actions. → Verify: full gates pass.

## Risks
- Thay hard-code role có thể mở quyền sai nếu permission context thiếu: evaluator fail-closed.
- Migration down destructive: chỉ dùng cho disposable/dev DB hoặc restore-approved procedure.
- Existing clients remain compatible: endpoint response additive; seed mapping reproduces current 4-role behavior.

## Done When
- Permission editor controls real API authorization.
- No TypeScript errors.
- Permission changes and audit are atomic.
- Production migration/reconciliation procedure documented and verified.
- Server/web full test gates pass.
