# Plan: Issues Engine & Storage (Domain 3)

## Goal
Xây dựng module quản lý Locations, Tags, Issues CRUD, File Upload Sanitization (Magic bytes, 2MB, UUID v4), Concurrency State Machine (Optimistic Locking, Conflict 409, Force Overwrite), và Static Asset File Server (`GET /uploads/*`) theo Mục 4, 5, 6.2, 6.3 của SPEC.md.

## Tasks
- [x] Task 1: Tạo `internal/storage/storage.go` quản lý lưu trữ file an toàn (UUID validation, magic bytes sniff JPEG/PNG, max 2MB, path traversal defense) và HTTP handler `GET /uploads/*` kèm `Cache-Control: immutable` → Verify: Unit test upload valid, oversize, invalid magic bytes, path traversal
- [x] Task 2: Cập nhật `sql/queries.sql` và sinh lại `internal/db` với các query: Locations CRUD, Tags CRUD & use_count, Issues List (lọc theo category, location, status kèm pagination), Issue by ID/UUID, Issue Status Transitions (guard version + status) → Verify: sqlc sinh mã không lỗi, compile pass
- [x] Task 3: Tạo `internal/masterdata/handler.go` xử lý `GET /api/locations`, `POST /api/locations` (Admin), `GET /api/tags`, `POST /api/tags` (Admin) → Verify: Unit test endpoints trả đúng API envelope
- [x] Task 4: Tạo `internal/issue/service.go` đóng gói nghiệp vụ: Sync mới (Issue + IssueTags + NotificationOutbox PENDING), Resolve (Concurrency check 409, Force Overwrite), Close (RBAC check, 6S Safety check, score points trigger), Reopen (penalty trigger, outbox REOPENED), Invalid (penalty reporter), Quick Edit (PATCH category/tags, Safety escalation) → Verify: Unit test state machine và RBAC logic
- [x] Task 5: Tạo `internal/issue/handler.go` tiếp nhận `GET /api/issues`, `GET /api/issues/{id}`, `POST /api/issues/sync`, `POST /api/issues/{id}/resolve`, `POST /api/issues/{id}/close`, `POST /api/issues/{id}/reopen`, `POST /api/issues/{id}/invalid`, `PATCH /api/issues/{id}` → Verify: Unit test handlers với multipart upload và JSON response envelope
- [x] Task 6: Tích hợp MasterData, Issues routes và Uploads static server vào `cmd/server/main.go` → Verify: Test tích hợp toàn bộ flow: tạo issue, upload ảnh, resolve, close
- [x] Task 7: Chạy kiểm thử toàn diện server (`./leedevkit test server --lint-only` và `./leedevkit test server --unit-only`) → Verify: 100% tests pass và không lỗi linter

## Done When
- [x] Toàn bộ unit tests cho storage, masterdata, issue service, handlers pass 100%
- [x] `./leedevkit test server --lint-only` và `./leedevkit test server --unit-only` pass không lỗi
