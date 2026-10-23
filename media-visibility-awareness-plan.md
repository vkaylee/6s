# Media Visibility Awareness & Restricted Photo UX

## Goal
Cung cấp UX nhận diện nguyên nhân không xem được ảnh, phân biệt rõ ràng giữa thiếu quyền (403), hết phiên (401), lỗi mạng và mất file để người dùng không ngộ nhận hệ thống bị lỗi.

## Tasks
- [x] Task 1: Phân biệt mã lỗi tại backend media handler → Trả về `403 Forbidden` khi issue tồn tại nhưng user không đạt điều kiện `canViewIssue()` (giữ `404` khi không tìm thấy issue).
  → Verify: `./scripts/_go.sh test ./internal/issue -run TestHandler_Media`
- [x] Task 2: Bổ sung từ khóa đa ngữ (`vi.json`, `en.json`, `zh.json`) cho các trạng thái ảnh: thiếu quyền, hết phiên, lỗi mạng, mất tập tin và nút thử lại.
  → Verify: `./leedevkit test web --unit-only`
- [x] Task 3: Nâng cấp `fetchAuthenticatedBlob` và hook `useAuthenticatedImageUrl` trong frontend để trả về mã phân loại lỗi (`FORBIDDEN`, `UNAUTHORIZED`, `NOT_FOUND`, `NETWORK_ERROR`).
  → Verify: `./scripts/_bun.sh test test/authenticatedImage.test.ts`
- [x] Task 4: Cải tiến `AuthenticatedImage` hiển thị giao diện phân tầng: thumbnail nhỏ hiển thị icon và nhãn lỗi; khung lớn hiển thị thông điệp chi tiết; lỗi mạng có nút `Thử lại`.
  → Verify: `./scripts/_bun.sh test test/authenticatedImage.test.tsx`
- [x] Task 5: Chặn tương tác mở phóng to (`IssueDetailModal` zoom dialog) khi ảnh đang ở trạng thái thiếu quyền hoặc lỗi.
  → Verify: `./scripts/_bun.sh test test/issueDetailModal.test.tsx`
- [x] Task 6: Chạy toàn bộ kiểm tra chất lượng tự động (lint + unit tests cả server và web).
  → Verify: `./leedevkit test server --lint-only && ./leedevkit test server --unit-only && ./leedevkit test web --lint-only && ./leedevkit test web --unit-only`

## Done When
- [x] Người dùng không có quyền xem ảnh nhìn thấy rõ biểu tượng bảo mật và thông điệp nguyên nhân, không còn icon ảnh hỏng.
- [x] Khi mất mạng hoặc hết phiên đăng nhập, hệ thống hiển thị đúng nguyên nhân kỹ thuật; lỗi mạng có nút thử lại.
- [x] Toàn bộ unit test và lint của server và web vượt qua không có hồi quy.

## Notes
- Không làm lộ nội dung ảnh hoặc metadata nhạy cảm khi trả về 403.
- Giữ nguyên cơ chế bảo mật site isolation và RBAC hiện tại.
