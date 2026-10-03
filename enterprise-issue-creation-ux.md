# Enterprise Issue Creation UX Plan

Status: Complete

## Goal
Nâng cấp trải nghiệm tạo issue đạt chuẩn Enterprise: AI trợ lý không chặn quy trình, gợi ý trọn bộ phân loại (Category 1S–6S, Cause Type CONDITION/BEHAVIOR, Thẻ nguyên nhân), và hỗ trợ áp dụng nhanh 1-chạm hoặc tùy chỉnh linh hoạt.

## Constraints & Architecture
- Tuân thủ quy tắc hermetic (`./scripts/_bun.sh`, `./scripts/_go.sh`, `./leedevkit test ...`).
- Giữ nguyên hợp đồng bảo mật: AI chỉ mang tính gợi ý (human-in-the-loop), không tự động lưu dữ liệu vào catalog khi chưa duyệt.
- Hỗ trợ cả 2 chế độ:
  - Chỉ có mô tả (Text AI): gợi ý category, cause_type, tags.
  - Có thêm ảnh bằng chứng (Vision AI): nâng cao độ chính xác nhận diện hiện trường.
- Giữ vững i18n (`vi`, `en`, `zh`), accessibility (WCAG AA contrast, touch target >= 44px, screen-reader semantics), dark mode.
- Độ dài file tối đa 500 dòng theo quy chuẩn repository (`scripts/check-file-length.mjs`).

- [x] 1. Backend: Mở rộng `SuggestTags` trong `internal/ai/service.go` để trả về `category` và `cause_type` (CONDITION/BEHAVIOR) kèm prompt & parser.
- [x] 2. Backend Tests: Cập nhật unit test trong `internal/ai/service_test.go` kiểm thử gợi ý category và cause_type.
- [x] 3. Frontend API: Mở rộng `TagSuggestionResult` trong `web/src/api/operations.ts` chứa `category` và `cause_type`.
- [x] 4. Frontend Logic: Cập nhật `useDescriptionAiSuggestions` nới lỏng điều kiện gọi AI (chỉ cần mô tả, có ảnh thì kèm ảnh), đồng thời nhận diện và áp dụng `cause_type`.
- [x] 5. Frontend UI: Chuyển đổi banner thành Inline Assistive Card tinh gọn với nút "Áp dụng tất cả" (1-click Apply All) và xem chi tiết phân loại đề xuất.
- [x] 6. Localization: Bổ sung từ khóa bản dịch (`vi`, `en`, `zh`) cho các trạng thái gợi ý nguyên nhân và nút áp dụng.
- [x] 7. Frontend Tests: Cập nhật và bổ sung test unit cho flow gợi ý nguyên nhân, áp dụng 1-chạm và component UI.
- [x] 8. Phase Verification: Chạy kiểm tra linting, format, typecheck, unit test và full regression suite.

- [x] AI có thể chạy ngay khi có mô tả (không bắt buộc phải có ảnh trước).
- [x] Kết quả AI bao gồm: Phân loại 6S, Loại nguyên nhân (CONDITION/BEHAVIOR), Thẻ catalog và Thẻ đề xuất mới.
- [x] Người dùng có nút "Áp dụng tất cả" hoặc có thể chọn từng mục riêng lẻ.
- [x] Tất cả tests (Go + Web) và linter đều vượt qua 100%.
