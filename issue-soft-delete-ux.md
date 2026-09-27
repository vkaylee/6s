# Issue Soft Delete UX Optimization

Status: Approved

## Goal
Chuyển nút "Xoá mềm" (và tuỳ chọn "Khôi phục") từ nút to chiếm chỗ trên header modal chi tiết issue vào menu hành động gọn gàng (`⋯` MoreHorizontal / dropdown menu), giữ header thoáng và tránh bấm nhầm.

## Constraints and Interfaces
- **Global constraints:** 
  - Tuân thủ WCAG 2.1 AA: menu trigger có `aria-haspopup="true"`, `aria-expanded`, nhãn `aria-label`, phím `Escape` đóng menu, click ngoài đóng menu, focus ring rõ ràng.
  - Giữ nguyên flow xác nhận xoá mềm (hỏi lý do bắt buộc 1–1000 ký tự qua dialog hiện tại).
  - Không phá vỡ luồng khôi phục (`RESTORE`) và smoke test E2E (`issue-deletion-smoke.spec.js`).
- **Global interfaces:**
  - File: `web/src/pages/IssueDetailModal.tsx`
  - Unit test: `web/test/issueDetailModal.test.tsx`
  - E2E test: `web/e2e/issue-deletion-smoke.spec.js`

## Tasks
- [x] Task 1: Thêm state `isActionMenuOpen` và click-outside / escape listener trong `IssueDetailModal.tsx` → Constraints: đóng khi bấm ra ngoài hoặc nhấn phím Escape → Interface: Header actions trong `IssueDetailModal.tsx` → Verify: menu mở/đóng đúng phím và chuột.
- [x] Task 2: Gom nút xoá mềm `canDeleteIssue` vào menu dropdown `⋯` (MoreHorizontal) với icon và màu cảnh báo rose/đỏ → Constraints: giữ nguyên nút `Pencil` (Sửa) và `X` (Đóng) ngoài header; nút khôi phục `canRestoreIssue` có thể hiển thị trong menu hoặc banner trạng thái đã xoá → Interface: `web/src/pages/IssueDetailModal.tsx` → Verify: header tiết kiệm ~100px diện tích, nút xoá không còn choán thanh tiêu đề.
- [x] Task 3: Bổ sung unit test kiểm tra tương tác mở menu và kích hoạt dialog xoá mềm → Constraints: chạy bằng hermetic bun test runner → Interface: `web/test/issueDetailModal.test.tsx` → Verify: `./scripts/_bun.sh test test/issueDetailModal.test.tsx`.
- [x] Task 4: Cập nhật E2E test `web/e2e/issue-deletion-smoke.spec.js` nếu bộ chọn cần mở menu hành động trước khi bấm xoá → Constraints: test E2E pass → Interface: `web/e2e/issue-deletion-smoke.spec.js` → Verify: Playwright step chọn nút xoá mềm qua menu nếu áp dụng.
- [x] Task 5: Chạy toàn bộ test web & lint để đảm bảo không hồi quy → Constraints: tuân thủ hermetic wrappers → Interface: repo test suite → Verify: `./leedevkit test web --lint-only` && `./leedevkit test web --unit-only`.

## Done When
- [x] Header `IssueDetailModal` không còn nút chữ dài "Xoá mềm" cố định choán diện tích.
- [x] Nút `⋯` mở menu popover chứa hành động "Xoá mềm" với đầy đủ hỗ trợ bàn phím (`Escape`, `Enter`, click outside).
- [x] Bấm "Xoá mềm" trong menu mở đúng modal nhập lý do và thực hiện xoá mềm như cũ.
- [x] Unit test và web lint pass 100%.

## Review Focus
- Đảm bảo z-index của menu dropdown không bị che bởi sticky tabs hay media slider bên dưới.
- Đảm bảo trên mobile tap target của nút `⋯` tối thiểu 44x44px.
