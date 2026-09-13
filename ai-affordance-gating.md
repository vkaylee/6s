# AI affordance visibility and disabled-state guidance

## Goal
Luôn render button AI ở user flows. Khi AI chưa enable hoặc status chưa resolve, button disabled và UI giải thích cách bật; không gọi API AI ngoài status check.

## Quyết định
- **Luôn render button AI** trong `IssueDetailModal` và `CreateTagModal`; giữ discoverability.
- `aiEnabled === null`: button disabled, không warning lỗi; status còn đang tải.
- `aiEnabled === false`: button disabled, hiển thị cảnh báo ngắn với đường dẫn `Settings → AI` nếu phù hợp.
- `aiEnabled === true`: button hoạt động như hiện tại.
- Không thêm CTA bật AI trong luồng nghiệp vụ; cảnh báo chỉ hướng dẫn admin.
- `AdminConfigPage` vẫn là nơi bật/tắt AI.
- Badge `translated_by_ai` / `translated_badge` giữ nguyên; chúng phản ánh dữ liệu đã có.
- Backend không đổi; `/api/ai/status` trả `{ enabled: boolean }`, lỗi mạng giữ fail-closed.

## Tasks
- [ ] **1. Chuẩn hóa `useAiStatus`** — cập nhật `web/src/hooks/useAiStatus.ts`
  - Thêm hook trả `{ aiEnabled: boolean | null }` từ promise cache module-scope.
  - Giữ một request `/api/ai/status` mỗi phiên; lỗi trả `false`.
  - `invalidateAiStatus()` tiếp tục được gọi sau lưu cấu hình admin.

- [ ] **2. Đổi `IssueDetailModal.tsx`**
  - Dùng hook; bỏ state/effect fetch status cục bộ.
  - Render `ai_review_btn` và `translate_btn` không phụ thuộc `aiEnabled`.
  - `disabled={aiEnabled !== true || isReviewing/isTranslating}`; thêm `aria-disabled` và tooltip/title cho trạng thái chưa bật.
  - Chỉ gọi review/translate/cache khi `aiEnabled === true`.
  - Hiển thị cảnh báo khi `aiEnabled === false`; không hiển thị warning khi `null`.
  - Giữ auto-translate cache phụ thuộc status; không gọi `/api/ai/cached` khi AI off.

- [ ] **3. Đổi `CreateTagModal` trong `IssueTagsPage.tsx`**
  - Dùng hook; auto-translate chỉ chạy khi status `true`.
  - Render nút generate và retranslate luôn; disabled khi status chưa `true` hoặc đang loading.
  - Khi AI off, luôn render ba ô tên editable, seed ngôn ngữ nguồn, cho nhập tay và Save không bị chặn bởi `names === null`.
  - Hiển thị cảnh báo AI chưa bật; không gọi `/api/ai/translate` khi disabled.

- [ ] **4. Bổ sung i18n**
  - Thêm key cảnh báo AI chưa bật cho `web/src/i18n/locales/{vi,en,zh}.json`.
  - Giữ nguyên các key button hiện có.

- [ ] **5. Cập nhật regression coverage**
  - Sửa test Issue Detail: AI off vẫn có button, button disabled, cảnh báo hiện; AI on button enabled.
  - Thêm coverage CreateTagModal cho nhập tay khi AI off nếu test harness hiện có hỗ trợ.
  - Giữ test cache/invalidation: một request status, lỗi status fail-closed.

## Done When
- [ ] AI off hoặc status loading: button AI vẫn tồn tại trong DOM, disabled, không phát sinh request `/api/ai/*` ngoài `/api/ai/status`.
- [ ] AI off: cảnh báo rõ cách bật; CreateTagModal nhập tay và lưu được.
- [ ] AI on: review, translate, cached translation, tag auto-translate giữ hành vi hiện tại.
- [ ] `./leedevkit test web --lint-only` pass.
- [ ] `./leedevkit test web --unit-only` pass.

## Notes
- Chỉ sửa frontend và i18n. Không thêm dependency, DB migration, hay backend endpoint.
- Không disable AdminConfigPage controls.
