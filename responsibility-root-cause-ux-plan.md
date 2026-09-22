# Kế hoạch tối ưu UX: Phân công xử lý và Xác minh nguyên nhân gốc

## Mục tiêu
Đơn giản hóa trải nghiệm xem và xử lý issue trên mobile/web bằng cách tách bạch 2 luồng nghiệp vụ: **Đơn vị đi sửa lỗi** (vận hành hiện trường) và **Đơn vị gây lỗi** (phạt điểm KPI 6S); áp dụng progressive disclosure để giao diện gọn gàng, đúng đối tượng và đúng thời điểm.

## Quyết định thiết kế & kiến trúc
1. **Không thay đổi DB & API contract**: Giữ nguyên các trường `assigned_team_id`, `assignee_id`, `cause_team_id`, `cause_status` và endpoint `PATCH /api/issues/{id}`.
2. **Phân quyền hiển thị (Role-based Disclosure)**:
   - Công nhân / Người báo lỗi / Viewer: Chỉ thấy **Đơn vị xử lý** (Handling team & Assignee). Ẩn hoàn toàn trạng thái "Chưa xác minh" và các nút nghiệp vụ phạt để tránh nhiễu thông tin.
   - Khi nguyên nhân đã được xác nhận (`cause_status === "CONFIRMED"`): Hiển thị một badge thông tin nhỏ gọn và trang nhã về đơn vị chịu trách nhiệm.
3. **Đúng thời điểm trong vòng đời (Lifecycle timing)**:
   - Lúc mới tạo (`OPEN`): Trọng tâm 100% là điều phối người đi xử lý (Assignee / Handling team).
   - Lúc nghiệm thu đóng issue (`PENDING_REVIEW` -> `CLOSED`): Nhắc người duyệt (Safety Officer / Line Leader) chốt đơn vị gây lỗi nếu chưa xác minh.
4. **Hợp nhất thao tác nhanh (Smart Auto-suggest)**:
   - Trong form phân công xử lý của Safety/Admin: Thêm tuỳ chọn tiện ích 1-chạm *"Đồng bộ đơn vị gây lỗi theo team xử lý"* để hoàn tất cả 2 mục trong 1 lần lưu khi cùng một bộ phận chịu trách nhiệm.

---

## Ma trận đánh giá rủi ro & kiểm thử (Test Impact Matrix)

| Chiều kiểm thử | Phân tích & Kịch bản cần bảo vệ |
|---|---|
| **Hành vi thay đổi** | Viewer không có quyền `issue:verify_cause` không thấy nút/panel xác minh; giao diện gọn nhẹ trên mobile. Nút "Xác minh" chuyển sang dạng drawer/collapsible ngữ cảnh hoặc xuất hiện trong luồng duyệt đóng issue. |
| **Hành vi giữ nguyên** | Quyền `issue:assign` và `issue:verify_cause` kiểm tra độc lập tại server; audit log ghi đủ `ASSIGN_RESPONSIBILITY` và `VERIFY_CAUSE`; concurrency version check không đổi. |
| **Biên & đầu vào** | `cause_status = 'CONFIRMED'` bắt buộc chọn `cause_team_id`; `UNVERIFIED` / `NOT_APPLICABLE` tự động clear `cause_team_id`. |
| **Giao diện & Mobile** | Đạt chuẩn touch target >= 44px, không tràn layout ở viewport 360px-390px; contrast tỷ lệ text >= 4.5:1 (WCAG 2.1 AA). |

---

## Danh sách công việc (Tasks)

- [ ] **Task 1: Chuẩn hóa UX Card Phân công trên giao diện xem chi tiết**
  - Giữ khối "Assignment & responsibility" là thẻ hiển thị chính cho hiện trường (Thiết bị, Team xử lý, Người xử lý).
  - Di chuyển box xác minh nguyên nhân thành mục mở rộng (Accordion/Secondary Action) chỉ mở khi Safety Officer / Admin có nhu cầu chủ động đối soát.
  - *Verify:* Chạy `./leedevkit test web --unit-only`, kiểm tra thẻ hiển thị sạch sẽ trên cả mobile 390px và desktop.

- [ ] **Task 2: Tích hợp xác minh nguyên nhân vào luồng Nghiệm thu / Đóng issue (`Close/Review Modal`)**
  - Khi Safety Officer hoặc Line Leader duyệt hoàn thành issue (`PENDING_REVIEW` -> `CLOSED`), nếu `cause_status === "UNVERIFIED"`, hiển thị thêm một trường chọn nhanh "Đơn vị gây lỗi (để tính điểm 6S)" ngay trong popup nghiệm thu.
  - *Verify:* Kiểm tra modal duyệt hoàn thành chứa form chọn nguyên nhân nhanh và gửi payload hợp lệ lên backend.

- [ ] **Task 3: Bổ sung tuỳ chọn gợi ý tự động (Smart sync toggle)**
  - Trong popup phân công trách nhiệm (`ResponsibilityPicker` / Modal), cho phép tick chọn *"Gán luôn đơn vị này làm đơn vị gây lỗi"* để gửi đồng thời `assigned_team_id` và `cause_team_id` (kèm `cause_status = 'CONFIRMED'`) chỉ với 1 thao tác.
  - *Verify:* Test gửi payload kèm cả assignment và cause verification khi bật toggle, version tăng chính xác.

- [ ] **Task 4: Cập nhật bộ test tự động và từ điển i18n (vi/en/zh)**
  - Cập nhật `web/test/issueDetailModal.test.tsx` cho các luồng tương tác mới và điều kiện hiển thị theo role.
  - Bổ sung các nhãn hướng dẫn rõ ràng trong 3 ngôn ngữ: vi, en, zh.
  - *Verify:* `./leedevkit test web --lint-only && ./leedevkit test web --unit-only` pass 100%.

- [ ] **Task 5: Kiểm tra trực quan trên trình duyệt (Browser Smoke Verification)**
  - Mở tab Chromium thật trên dev server `https://localhost:8443`, đăng nhập tài khoản thường và tài khoản admin, chụp ảnh màn hình so sánh mobile view và desktop view.
  - *Verify:* Không có lỗi console, không vỡ layout, touch target đạt chuẩn.

---

## Tiêu chuẩn hoàn tất (Done When)
- [ ] Màn hình chi tiết issue không còn gây nhầm lẫn giữa đơn vị khắc phục và đơn vị chịu phạt.
- [ ] Công nhân/Line view bình thường không bị phân tâm bởi các trường xác minh nội bộ của QA/Safety.
- [ ] Người có thẩm quyền có thể xác minh nguyên nhân đúng thời điểm (lúc nghiệm thu hoặc qua thao tác mở rộng).
- [ ] Toàn bộ test suite web/backend pass.
