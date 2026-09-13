# Gate AI affordances theo trạng thái enabled

## Goal
Ẩn (không render) mọi nút/thao tác AI ở phía người dùng khi AI chưa được bật trong `AdminConfigPage`, dùng một nguồn trạng thái dùng chung thay vì fetch rải rác.

## Quyết định
- **Ẩn, không disable.** AI tắt là mặc định của hệ thống; nút disabled chỉ tạo affordance chết. Giữ Settings làm nơi bật.
- **Không render khi chưa biết trạng thái** (`null`) → tránh nhấp nháy nút rồi biến mất. Nút chỉ xuất hiện khi status resolve `true`.
- **Không thêm CTA "Bật AI"** trong luồng nghiệp vụ. Ngoài scope.
- `AdminConfigPage` **không** bị gate — đó là nơi bật/tắt.
- Badge `translated_by_ai` / `translated_badge` **không** bị gate — chúng phản ánh dữ liệu đã có, không phải affordance.

## Tasks

- [ ] **1. Hook `useAiStatus`** — tạo `web/src/hooks/useAiStatus.ts`
  - Fetch `GET /api/ai/status` **một lần**, cache ở module scope (promise dùng chung), tránh gọi lại mỗi modal.
  - Trả `{ aiEnabled: boolean | null }`; `null` = đang tải/chưa biết. Lỗi mạng → `false` (fail-closed, giống hành vi hiện tại của `IssueDetailModal.tsx:116`).
  - Verify: mở DevTools Network, mở/đóng nhiều issue modal → chỉ 1 request `/api/ai/status`.

- [ ] **2. `IssueDetailModal.tsx` dùng hook** — thay state + effect tại dòng 102–123
  - Xoá `const [aiEnabled, setAiEnabled] = useState(false)` (dòng 205) và effect fetch status; lấy từ `useAiStatus()`.
  - Reset `aiReview` khi modal đóng giữ nguyên (effect riêng).
  - Thêm `aiEnabled` vào deps của effect auto-translate (dòng 100) → sửa lỗi không tự dịch khi status resolve sau effect đầu.
  - Verify: bật AI → mở issue có mô tả → bản dịch cache tự hiện; tắt AI → không thấy nút "Hỏi AI"/"Dịch AI", không gọi `/api/ai/cached`.

- [ ] **3. `IssueTagsPage.tsx` gate `CreateTagModal`**
  - Dùng `useAiStatus()` trong `CreateTagModal`.
  - Auto-chạy `translateNames()` (effect dòng 263–267) chỉ khi `aiEnabled === true`.
  - Ẩn nút `tag_translate_btn` (dòng 393–401) và nút `tag_retranslate_btn` (dòng 413–420) khi `aiEnabled !== true`.
  - AI off: `names` là `null` → người dùng nhập tay 3 ô; nút Save phải **không** bị chặn bởi `aiLoading`/`names`. Hiện `disabled={saving || aiLoading || !names}` ở dòng 446 đang chặn Save khi `names === null` → sửa để cho phép nhập tay.
  - Verify: tắt AI → mở modal tạo tag mới → không có nút AI, 3 ô tên hiện trống và nhập được, lưu thành công. Bật AI → flow cũ giữ nguyên.

- [ ] **4. Chuỗi i18n không còn dùng** — kiểm tra `tag_translate_btn`, `tag_retranslate_btn`, `ai_review_btn`, `translate_btn` vẫn cần (chúng vẫn được render khi AI bật) → **giữ nguyên**. Không xoá key.
  - Verify: `grep` xác nhận mỗi key còn ít nhất 1 chỗ dùng.

## Done When
- [ ] AI tắt: không tồn tại DOM node nào của nút AI trong `IssueDetailModal` và `CreateTagModal`; không có request `/api/ai/*` nào phát sinh ngoài lần gọi status.
- [ ] AI bật: toàn bộ hành vi hiện tại không đổi.
- [ ] Chỉ 1 request `/api/ai/status` cho cả phiên làm việc.
- [ ] `./leedevkit test web --lint-only` và `./leedevkit test web --unit-only` pass.

## Notes
- Không đụng `internal/ai/*`: backend đã fail-closed đúng (`handler_test.go:122` — AI disabled trả 400).
- Không thêm state toàn cục vào `authStore`; trạng thái AI thuộc về server config, không thuộc phiên đăng nhập. Hook + module cache là đủ cho 2 consumer.
