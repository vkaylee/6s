# Plan: PWA Industrial UI (Domain 6)

## Goal
Xây dựng toàn bộ giao diện PWA Industrial theo tiêu chuẩn nhà xưởng (Mục 9 & 4.5 của SPEC.md):
1. Industrial Ergonomics (Touch targets 56-64px, bottom sticky action bar, high-contrast WCAG AA, dark mode, reduced motion, haptic feedback)
2. Network Status Bar (online/offline indicator, sync progress micro-bar, offline outbox drawer với thumbnail, retry-all, discard)
3. 1S-6S Selection với micro-hints & cascade tag filtering song ngữ (Tiếng Việt / 中文)
4. Dual-shot Context (Ảnh 1 toàn cảnh bắt buộc, Ảnh 2 cận cảnh tùy chọn) kèm Canvas resize
5. Trang chủ: Health Gauge Ring, Tab Xếp hạng Chuyền / Thợ săn 6S, Thanh lọc 1 chạm (Quick Facets)
6. Chi tiết Issue: Before/After Split Slider, In-place category/tags quick edit, Chấm sao Kaizen (1-5 sao), duyệt RBAC (Explainable disabled states)
7. Conflict Resolution View: Đối chiếu Bản máy này vs Bản máy chủ, Ghi đè hoặc Hủy nháp
8. Admin Config: Dynamic Stepper Scoring Rules + Hồi tố & Active Directory / Notification Config

## Tasks
- [x] Task 1: Tạo `web/src/types/index.ts` và `web/src/utils/haptics.ts` định nghĩa kiểu dữ liệu chuẩn và phản hồi rung vật lý (`50ms`, `50ms-50ms-100ms`, `200ms`) -> Verify: Unit test types & haptics
- [x] Task 2: Tạo `web/src/components/StatusBar.tsx` và `web/src/components/OfflineOutboxDrawer.tsx` hiển thị trạng thái kết nối, tiến trình sync micro-bar, và drawer quản lý draft IndexedDB -> Verify: Component render đúng các trạng thái PENDING, SYNCING, FAILED, CONFLICT
- [x] Task 3: Tạo `web/src/components/QuickFacets.tsx` và `web/src/components/HealthGauge.tsx` hiển thị thanh lọc nhanh 1 chạm và đồng hồ sức khỏe xưởng -> Verify: Unit test tính toán màu gauge và facet selection
- [x] Task 4: Tạo `web/src/components/IssueCard.tsx` và `web/src/components/SplitSlider.tsx` hiển thị thẻ issue chuẩn công nghiệp, icon trạng thái, và bộ so sánh Before/After kéo trượt -> Verify: Unit test format nhãn và tỉ lệ split
- [x] Task 5: Tạo `web/src/components/ConflictModal.tsx` giải quyết xung đột 409: đối chiếu bản máy này vs máy chủ (Segmented toggle trên mobile, 2 cột trên desktop) -> Verify: Test hiển thị dữ liệu đối chiếu
- [x] Task 6: Tạo `web/src/pages/CreateIssueModal.tsx` form báo cáo 6S: chọn 1S-6S với micro-hints, lọc tag cascade theo S, chụp ảnh toàn cảnh + cận cảnh, lưu draft tức thì -> Verify: Test validation và cascade filtering
- [x] Task 7: Tạo `web/src/pages/IssueDetailModal.tsx` xem chi tiết: in-place category edit, nút hành động RBAC rõ ràng (Explainable disabled), modal xác nhận 1 chạm, chấm điểm sao -> Verify: Test phân quyền nút bấm theo role
- [x] Task 8: Tạo `web/src/pages/AdminConfigModal.tsx` cấu hình điểm số Stepper tăng giảm 1 đơn vị, toggle hồi tố, cấu hình AD test bind và thông báo -> Verify: Test stepper giá trị
- [x] Task 9: Tạo `web/src/pages/LoginModal.tsx` hỗ trợ đăng nhập Local DB & AD LDAP, và tích hợp toàn bộ vào `web/src/App.tsx`, `web/src/main.tsx`, `web/index.html` -> Verify: Build static `vite build` và `leedevkit test web` thành công
- [x] Task 10: Chạy toàn bộ kiểm thử web (`./leedevkit test web --lint-only` và `./leedevkit test web --unit-only`) -> Verify: Pass 100% không lỗi

## Done When
- [x] `./leedevkit test web --lint-only` và `./leedevkit test web --unit-only` pass 100%
- [x] `bun run build` trong thư mục web sinh thư mục `web/dist` sẵn sàng nhúng Go binary
