# Plan: PWA Offline Engine (Domain 5)

## Goal
Xây dựng module PWA Offline Engine cho Client React: Client Image Compression (Canvas 1280px JPEG 0.7), IndexedDB Storage (`6s_local_db` với 3 stores: `draft_issues`, `draft_resolves`, `auth_session`), Zustand Auth Store (Access Token trong memory, Refresh Token trong IndexedDB, Offline Grace Mode), Network Probe & Auto-Sync Engine (lắng nghe `online`, polling 30s `/api/health`, background refresh JWT, sync multipart issues & resolves, HTTP 409 Conflict tracking) theo Mục 7.1, 7.2, 7.2.1, 7.3 của SPEC.md.

## Tasks
- [x] Task 1: Tạo `web/src/utils/compress.ts` nén ảnh client (Canvas max 1280px, JPEG quality 0.7, kiểm tra input Blob/File) -> Verify: Unit test nén ảnh trả về blob jpeg
- [x] Task 2: Tạo `web/src/db/indexeddb.ts` khởi tạo IndexedDB `6s_local_db` phiên bản 1 quản lý 3 object stores: `draft_issues` (key client_uuid), `draft_resolves` (key resolved_client_uuid), `auth_session` (key id) với helper CRUD đầy đủ -> Verify: Unit test lưu/đọc/xóa draft issues và resolves
- [x] Task 3: Tạo `web/src/store/authStore.ts` quản lý state đăng nhập: user profile và accessToken trong RAM, lưu/nạp refreshToken từ IndexedDB, hỗ trợ Offline Grace Mode khi mất mạng -> Verify: Unit test login, logout, refresh token và offline grace period
- [x] Task 4: Tạo `web/src/api/client.ts` bọc `fetch` xử lý Authorization header, tự động gọi refresh token khi nhận 401, parse response envelope `{data}`/`{error}` -> Verify: Unit test client request, envelope unwrapping và 401 auto refresh
- [x] Task 5: Tạo `web/src/sync/syncEngine.ts` hiện thực cơ chế Auto-Sync: lắng nghe online + polling 30s `/api/health`, sync tuần tự `draft_issues` (upload blob progress, multipart POST `/api/issues/sync`), sync `draft_resolves` (POST `/api/issues/{id}/resolve` kèm `expected_version`), bắt lỗi 409 chuyển `sync_status = 'CONFLICT'` -> Verify: Unit test luồng sync happy path và 409 conflict
- [x] Task 6: Chạy kiểm thử web (`./leedevkit test web --lint-only` và `./leedevkit test web --unit-only`) -> Verify: Pass 100% không lỗi Biome, TypeScript hay Bun test

## Done When
- [x] Toàn bộ unit tests cho compress, indexeddb, authStore, syncEngine pass 100%
- [x] `./leedevkit test web --lint-only` và `./leedevkit test web --unit-only` pass không lỗi
