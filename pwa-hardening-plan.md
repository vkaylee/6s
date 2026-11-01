# Plan: PWA Industrial Hardening

Status: Complete; full regression passed

## Goal
Khắc phục triệt để 8 lỗ hổng trong hệ thống PWA (Offline Engine, Service Worker, Header máy chủ, Quản lý tài nguyên) đảm bảo hoạt động tin cậy trong môi trường mạng nhà xưởng chập chờn (LAN/Lie-Fi).

## Invariants
1. Không đổi URL Service Worker `/sw.js` (không gắn hash vào tên file `sw.js`).
2. Server luôn trả `Cache-Control: no-cache, no-store, must-revalidate` cho `/sw.js` và `index.html`.
3. Không làm gián đoạn API hợp đồng hiện hữu giữa Go backend và React PWA client.
4. Lỗi dữ liệu vĩnh viễn (HTTP 4xx) không được retry tự động vô hạn.
5. Xung đột 409 phải đối chiếu được phiên bản thực tế của server và cập nhật/xóa đúng trong IndexedDB.
6. Mọi thao tác xử lý ảnh (`createImageBitmap`, `createObjectURL`) phải thu hồi bộ nhớ ngay sau khi dùng.

## Tasks

### Giai đoạn 1: Sửa lỗi hiển thị trạng thái mạng & Rò rỉ RAM (Quick Fixes)
 - [x] Task 1.1: Khởi tạo đúng trạng thái mạng ban đầu trong `web/src/components/StatusBar.tsx`.
  - Đổi `useState(false)` thành `useState(() => typeof navigator !== "undefined" && navigator.onLine)`.
  - Verify: Load trang lần đầu trên trình duyệt hiển thị ngay trạng thái trực tuyến (chấm xanh).
 - [x] Task 1.2: Thu hồi bộ nhớ ảnh (`createImageBitmap` & `createObjectURL`).
  - Trong `web/src/utils/compress.ts`: bọc `try...finally` đảm bảo gọi `bitmap.close()`.
  - Trong `web/src/components/ConflictModal.tsx`: dùng `useMemo` hoặc `useEffect` để giải phóng URL blob khi modal đóng/chuyển tab.
  - Trong `web/src/pages/create-issue/useIssueForm.ts`: lưu ref URL cũ và gọi `URL.revokeObjectURL(oldUrl)` trước khi gán URL mới hoặc khi unmount.
  - Verify: Unit test `compress.test.ts` pass, không có rò rỉ URL/bitmap khi nén nhiều ảnh liên tiếp.

### Giai đoạn 2: Hiện thực hóa giải quyết xung đột 409 (Conflict Resolution)
 - [x] Task 2.1: Bổ sung logic thực tế cho `AppConflictResolution` trong `web/src/layout/AppSyncBanner.tsx`.
  - Khi mở modal: fetch thông tin issue hiện tại qua `fetchIssue(issueId)` để lấy `version` thực tế và `photo_after` của server.
  - Khi bấm `onOverwrite`: cập nhật `expected_version = serverIssue.version` vào record `draft_resolves`, đổi `sync_status = PENDING`, lưu IndexedDB, gọi `syncEngine.triggerSync()`.
  - Khi bấm `onDiscard`: gọi `deleteDraftResolve(resolved_client_uuid)` để xóa sạch nháp xung đột khỏi IndexedDB.
  - Verify: Tạo xung đột giả lập version cũ; bấm Overwrite thành công cập nhật expected_version mới; bấm Discard xóa khỏi IndexedDB.

### Giai đoạn 3: Khả năng hoạt động ngoại tuyến (Offline Resilience - Master Data)
 - [x] Task 3.1: Mở rộng IndexedDB lưu trữ Locations và Tags trong `web/src/db/indexeddb.ts`.
  - Nâng `DB_VERSION = 4`, thêm object store `cached_locations` (key `code`) và `cached_tags` (key `name` hoặc `id`).
  - Thêm helper: `saveCachedLocations()`, `getCachedLocations()`, `saveCachedTags()`, `getCachedTags()`.
  - Verify: Unit test IndexedDB lưu và đọc được danh sách vị trí/tags đệm.
 - [x] Task 3.2: Tích hợp cache fallback trong `web/src/hooks/useDashboardData.ts`.
  - Trong `loadMasterData`: đọc dữ liệu từ IndexedDB gán vào state trước; sau đó gọi `fetchLocations()` và `fetchTags()`. Nếu thành công thì ghi đè vào IndexedDB; nếu lỗi mạng thì giữ nguyên dữ liệu đệm, không gán rỗng `[]`.
  - Verify: Khi ngắt mạng (offline), form tạo issue vẫn hiển thị đầy đủ danh sách vị trí để chọn.

### Giai đoạn 4: Kiểm soát vòng lặp Sync & Giới hạn Retry
 - [x] Task 4.1: Bổ sung `retry_count` và phân loại lỗi trong `web/src/sync/syncEngine.ts`.
  - Thêm trường `retry_count?: number` vào `DraftIssue` và `DraftResolve`.
  - Phân loại mã HTTP phản hồi:
    - Nếu mã lỗi 400, 422: đánh dấu `sync_status = SyncStatus.FAILED`, `retry_count = 999` (dừng retry vĩnh viễn), hiển thị lỗi lên Outbox drawer.
    - Nếu lỗi mạng hoặc 5xx: tăng `retry_count++`. Nếu `retry_count >= 5`, dừng auto-probe sync định kỳ 30s. Chỉ cho phép retry khi người dùng bấm "Thử lại tất cả" trên giao diện.
  - Verify: Unit test mô phỏng backend trả 400 không bị gửi lại ở lần probe tiếp theo.

### Giai đoạn 5: Cấu hình Cache-Control máy chủ Go Backend
 - [x] Task 5.1: Cấu hình Cache-Control chuẩn cho SPA và Service Worker trong `cmd/server/spa.go`.
  - Cho `/sw.js` và `/index.html`: `Cache-Control: no-cache, no-store, must-revalidate`.
  - Cho `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`.
  - Cho `/manifest.webmanifest` và static icons: `Cache-Control: no-cache`.
  - Verify: Test HTTP response headers qua `cmd/server/spa_test.go` hoặc unit test server.

### Giai đoạn 6: Tối ưu Service Worker & Chuẩn hóa Icon PWA
 - [x] Task 6.1: Tối ưu chiến lược cache trong `web/public/sw.js`.
  - Áp dụng timeout 3s cho navigate request: nếu mạng xưởng Lie-Fi chậm quá 3s, tự động ngắt fetch và trả về `index.html` trong cache.
  - Áp dụng `Cache-First` cho các file tĩnh đã hash trong `/assets/`.
  - Verify: Giả lập mạng chậm 10s, trang vẫn load ngay lập tức từ cache.
 - [x] Task 6.2: Bổ sung icon PNG cho iOS và Android trong `web/public/` và `web/index.html`.
  - Tạo các file PNG chuẩn: `apple-touch-icon.png` (180x180), `icon-192.png`, `icon-512.png`.
  - Cập nhật `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` trong `web/index.html`.
  - Khai báo thêm icon PNG vào `web/public/manifest.webmanifest`.
  - Verify: Kiểm tra cấu hình thẻ meta và manifest qua lint.

### Giai đoạn 7: Kiểm thử toàn diện & Nghiệm thu
 - [x] Task 7.1: Chạy toàn bộ kiểm thử hệ thống qua LeeDevKit wrappers.
  - `./leedevkit test all` — 14/14 checks passed: Go unit, Go integration, Go lint/vet, web unit, Playwright E2E, web i18n/typecheck/lint.
  - DNS probe rejects unspecified-only answers (`0.0.0.0`, `::`) as unusable.
  - Verify: 100% tests pass, không lỗi TypeScript, Biome hay Go vet.

## Done When
 - [x] Không còn lỗi hiển thị offline giả lúc tải trang.
 - [x] Nút "Ghi đè" và "Hủy nháp" trong ConflictModal hoạt động thật với API và IndexedDB.
 - [x] Mất mạng vẫn mở được dropdown vị trí và tạo issue draft.
 - [x] Không có vòng lặp sync vô tận khi draft sai dữ liệu.
 - [x] Header HTTP trả đúng `Cache-Control: no-cache` cho `sw.js` và `index.html`.
 - [x] Toàn bộ test suite pass 100%.
