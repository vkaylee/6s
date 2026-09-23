# AI gợi ý tag và tag chờ duyệt

## Mục tiêu
Cho phép AI gợi ý tag chuẩn hoặc đề xuất tag mới từ text + category + mô tả. Người tạo được dùng tag `PENDING` ngay; tag hiển thị chip trạng thái, không làm bẩn catalog của user khác.

## Quyết định đã chốt
- Tag mới lưu trong `tags` với vòng đời `PENDING | APPROVED | REJECTED | MERGED`; giữ FK `issue_tags.tag_code -> tags.code`.
- Picker hiển thị `APPROVED` cho mọi user; `PENDING` chỉ cho creator đã tạo tag và Admin.
- Issue/card/detail luôn render metadata tag, kể cả `PENDING`/`REJECTED`/`MERGED`.
- Tag bị từ chối không bị xóa khỏi issue; chip xám để giữ lịch sử.
- AI chỉ gợi ý; không được tự tạo tag canonical. Server sinh code, kiểm tra quyền, category, độ dài và giới hạn số đề xuất.
- AI lỗi hoặc tắt không chặn tìm tag thủ công hay post issue.

## Công việc

- [x] **1. Chốt contract và schema tag lifecycle** — Thêm migration cho `status`, `created_by`, `reviewed_by`, `reviewed_at`, `merged_tag_code`; cập nhật `sql/schema.sql`, `sql/queries.sql`, OpenAPI và chạy SQLC. Thêm `tag_details` vào issue response để mọi viewer render được trạng thái tag pending/rejected dù catalog không hiển thị tag đó.
  **Verify:** migration up/down chạy được; generated types/query compile; contract có field nullable để tương thích payload cũ.

- [x] **2. Xây backend tạo issue atomic với proposed tags** — Mở rộng `SyncIssueRequest`, multipart `proposed_tags`, `DraftIssue` contract phía server; validate tối đa 5 đề xuất, tên/category hợp lệ, deduplicate theo code chuẩn hóa; upsert pending tag và insert `issue_tags` trong cùng transaction; giữ idempotency theo `client_uuid`.
  **Verify:** test tạo issue với tag chuẩn + pending; retry không nhân bản; tag invalid/khác site bị từ chối; FK không bị lỗi.

- [x] **3. Thêm quyền đọc catalog theo viewer** — Tạo query/API trả `APPROVED` cho mọi user, `PENDING` của chính creator và toàn bộ tag cho Admin; ẩn `REJECTED`/`MERGED` khỏi picker; giữ query AI catalog chỉ dùng tag approved.
  **Verify:** unit/API tests cho owner, user khác và Admin; issue response vẫn trả `tag_details` đầy đủ.

- [x] **4. Thêm AI endpoint gợi ý tag** — Implement `POST /api/ai/suggest-tags` nhận `query`, `category`, `description`; prompt bắt model chọn code từ catalog approved trước, chỉ đề xuất tag mới khi không có match; parse/validate JSON server-side, rate-limit theo policy hiện có, fail-closed khi AI disabled.
  **Verify:** parser loại code không tồn tại, category sai, field thiếu và output ngoài schema; AI disabled không gọi gateway; AI failure trả lỗi không chặn flow thủ công.

- [x] **5. Cập nhật offline draft và sync** — Thêm `proposed_tags` vào `DraftIssue`, IndexedDB serialization và `buildIssueSyncFormData`; bảo đảm draft cũ không có field vẫn sync bình thường.
  **Verify:** unit test draft có/không có proposed tags; sync retry giữ nguyên proposal và không mất ảnh/tag.

- [x] **6. Cập nhật UX picker và chip trạng thái** — Thêm nút AI cạnh ô tìm kiếm, disabled theo `useAiStatus`; render nhóm tag chuẩn/tag đề xuất, cho user chọn/bỏ chọn thủ công; `TagLabel`/picker hiển thị `PENDING` dashed + icon, `REJECTED` xám, `MERGED` nhãn đã gộp; thêm i18n vi/en/zh và aria-label/tooltip.
  **Verify:** test modal cho loading, AI off, existing suggestion, proposed suggestion, no-result và keyboard; kiểm tra touch target/layout mobile.

- [x] **7. Xây moderation trong `/admin/tags`** — Thêm tab/filter pending và action Approve, Reject, Merge; approve chuyển canonical thành `APPROVED`; merge chuyển issue sang tag đích trong transaction, lưu `merged_tag_code`; reject giữ issue tag và đổi chip xám; audit log đầy đủ. Không để batch active/inactive hoặc top-tags report xử lý pending như approved.
  **Verify:** backend tests cho approve/reject/merge, quyền 403 với non-admin, concurrency/version guard; admin UI hiển thị count và trạng thái sau thao tác.

- [x] **8. Regression, smoke và tài liệu contract** — Cập nhật test web/server/OpenAPI; chạy lint/unit theo wrapper; mở browser kiểm tra tạo issue online/offline, chip pending, picker owner/non-owner và admin moderation.
  **Verify:** `./leedevkit test server --lint-only`; `./leedevkit test server --unit-only`; `./leedevkit test web --lint-only`; `./leedevkit test web --unit-only`; browser smoke pass trên mobile và desktop.

## Done When
- Người tạo chọn và dùng tag `PENDING` ngay trong issue.
- User khác không thấy tag pending trong picker nhưng vẫn thấy chip trạng thái khi xem issue đã gắn tag.
- Admin approve/reject/merge không làm mất issue lịch sử.
- AI chỉ hỗ trợ gợi ý; AI off/lỗi vẫn post issue được.
- Online, offline, retry và contract cũ đều không mất tag hay tạo duplicate.
