# Kế hoạch nâng chất lượng bản dịch

## Mục tiêu
Đưa `web/src/i18n/locales/{vi,en,zh}.json` đạt độ chính xác nghiệp vụ, ngữ pháp tự nhiên và nhất quán thuật ngữ cao nhất; giữ nguyên key, placeholder và hành vi i18n.

## Phạm vi
- Locale: tiếng Việt, English, 简体中文.
- Ngữ cảnh: form quản trị, báo cáo, dashboard, issue workflow, offline queue, AI, 6S.
- Không đổi API, key, cấu trúc JSON hoặc logic fallback nếu không phát hiện lỗi riêng.

## Tasks

- [ ] **Chốt glossary và quy tắc văn phong ba locale**
  - Chốt thuật ngữ nền: issue, reporter, tag, category, resolve, maintenance, hotspot, review log, Kaizen, Safety Officer, Line Leader.
  - Quy định cách viết hoa, dấu câu, số đo, tên viết tắt, thuật ngữ kỹ thuật giữ nguyên.
  - Kết quả: một glossary duy nhất dùng làm chuẩn review và CI.

- [ ] **Lập bảng kiểm kê lỗi theo key và mức độ**
  - Ghi từng finding vào bảng: locale, key, nguồn nghĩa, hiện tại, đề xuất, severity, trạng thái.
  - Ưu tiên lỗi sai ngôn ngữ placeholder, sai nghĩa nghiệp vụ, sai thuật ngữ kỹ thuật, rồi mới đến style.
  - Kết quả: không còn finding trùng hoặc đề xuất mâu thuẫn.

- [ ] **Sửa lỗi chắc chắn trong ba locale**
  - Sửa 8 placeholder nhập sai ngôn ngữ.
  - Sửa `reporter`, DNS `解析`, `Kaizen`, `Maintenance`, `hotspots`, `review log`, `fullscreen`, cùng các câu sai nghĩa đã xác nhận.
  - Giữ nguyên toàn bộ key và placeholder.

- [ ] **Chuẩn hóa thuật ngữ và câu UI theo ngữ cảnh**
  - Chuẩn hóa `issue/tag/reporter` trong tiếng Việt.
  - Làm tự nhiên các câu English và Simplified Chinese; loại bỏ trộn ngôn ngữ không cần thiết.
  - Soát từng nhóm màn hình thay vì dịch từng câu độc lập: login, issue creation, issue detail, admin, outbox, reports.

- [ ] **Bổ sung kiểm tra tự động chất lượng bản dịch**
  - Mở rộng `web/test/i18n.test.tsx` kiểm tra key parity, non-empty, placeholder parity.
  - Thêm kiểm tra placeholder field-language cho các key `*_vi`, `*_en`, `*_zh`.
  - Thêm danh sách thuật ngữ cấm hoặc cần review thủ công, tránh false positive với URL, API, DB, AI, TLS, LDAP, IndexedDB.

- [ ] **Rà soát bản dịch bởi người bản ngữ**
  - Người Việt rà `vi`, người dùng English chuyên nghiệp rà `en`, người Trung bản địa rà `zh`.
  - Review theo màn hình và hành động thực tế, không chỉ đối chiếu từng từ.
  - Ghi rõ lựa chọn khác biệt giữa dịch sát nghĩa và thuật ngữ sản phẩm.

- [ ] **Kiểm tra giao diện và độ dài chuỗi**
  - Chạy web thực tế, chuyển lần lượt `vi/en/zh`, kiểm tra form, modal, nút, aria-label, reports và responsive.
  - Tìm overflow, xuống dòng xấu, mất ngữ cảnh, câu quá dài và lỗi font/dấu câu.
  - Sửa câu tại locale, không rút ngắn bằng cách làm mất nghĩa.

- [ ] **Chạy kiểm thử và xác nhận tiêu chí hoàn tất**
  - Chạy `./leedevkit test web --lint-only`.
  - Chạy `./leedevkit test web --unit-only`.
  - Chạy smoke/E2E locale switch nếu môi trường cho phép.
  - Xác nhận: 3 locale đủ key, placeholder khớp, không còn lỗi severity HIGH/MEDIUM, glossary nhất quán, UI không tràn.

## Nguyên tắc quyết định
- Ưu tiên nghĩa nghiệp vụ và khả năng hiểu của người vận hành hơn dịch từng chữ.
- Không đổi key để sửa câu dịch.
- Không dùng bản dịch máy làm nguồn cuối cùng.
- Tên vai trò, giao thức, URL và mã kỹ thuật giữ nguyên khi đó là tên sản phẩm/chức danh chính thức.
- Mọi thay đổi câu phải đối chiếu component đang sử dụng key.

## Done when
- [ ] Không còn lỗi dịch chắc chắn hoặc lỗi placeholder.
- [ ] Mọi finding còn lại được đánh dấu là chủ ý, có lý do.
- [ ] Glossary được áp dụng nhất quán cả ba locale.
- [ ] Kiểm thử web và smoke/E2E locale switch đạt.
