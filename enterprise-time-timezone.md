# Enterprise Time & Timezone

## Goal
Chuẩn hóa thời gian toàn hệ thống: lưu UTC, hiển thị theo site/user, scheduler site-local an toàn DST, tương thích triển khai hiện tại.

## Scope decisions
- PostgreSQL `TIMESTAMPTZ` và API ISO-8601 UTC là canonical.
- `sites.timezone` là timezone vận hành; `users.timezone NULL` kế thừa site.
- `users.locale` điều khiển ngôn ngữ/định dạng; timezone chỉ nhận IANA.
- SLA, penalty, cron so sánh instant UTC; ngày nghiệp vụ tính theo timezone site.
- Audit/export giữ UTC và ghi timezone hiển thị, không dùng timezone client cho quyền hạn.
- Vì migration hiện tại chưa có `sites`, phải bổ sung tenant/site model hoặc xác nhận mapping site trước khi sửa scheduler đa site.

## Tasks
- [ ] **Chốt kiến trúc và ADR**: ghi context, UTC/IANA decision, site/user precedence, DST gap/fold, rollback, vận hành; xác định cách gắn location/user hiện tại vào `sites`.
- [ ] **Thiết kế migration dữ liệu**: tạo/hoàn thiện `sites.timezone`; thêm `users.timezone`, `users.locale`; validate IANA; backfill an toàn; viết `.up.sql` và `.down.sql`; xử lý mixed-version.
- [ ] **Cập nhật DB/sqlc/API contracts**: đưa timezone/locale vào model user/site, admin update/profile response; giữ field additive; trả timestamp ISO-8601 UTC; reject timezone không hợp lệ với lỗi ổn định.
- [ ] **Tạo time policy helper**: `ResolveUserLocation(user, site)`, IANA validation, UTC serialization, local business-date; không dùng fixed offset/fallback ICT trong production.
- [ ] **Refactor scheduler**: resolve timezone theo site, xử lý DST gap/fold, idempotency theo job/site/business-date, lưu execution instant và timezone metadata; giữ catch-up/retry/error logging.
- [ ] **Chuẩn hóa frontend/export**: một formatter dùng locale + resolved timezone; hiển thị offset/timezone khi cần; thay `toLocaleString()` rải rác; không đổi logic SLA đang tính bằng epoch.
- [ ] **Bổ sung test behavior**: UTC round-trip; site fallback/user override; invalid IANA; DST gap/fold; scheduler idempotency/catch-up; API compatibility; unauthorized cross-site timezone tampering; migration rollback.
- [ ] **Verification**: chạy `./leedevkit test server --lint-only`, `./leedevkit test server --unit-only`, `./leedevkit test web --lint-only`, `./leedevkit test web --unit-only`; smoke test API, scheduler, UI hiển thị; kiểm tra migration up/down trên bản sao DB.

## Done when
- Mọi instant mới lưu UTC; API contract nhất quán.
- Site-local schedules chạy đúng theo IANA timezone, không chạy trùng khi DST.
- User override và site fallback hoạt động; timezone client không ảnh hưởng authorization/audit.
- Migration rollback được; test matrix và wrapper checks pass.

## Risks
- Migration hiện tại thiếu `sites`; không triển khai scheduler đa site trước khi chốt tenant mapping.
- Generated `internal/db/queries.sql.go` phải được regenerate bằng wrapper SQLC, không sửa tay.
- Timestamp date-bucketing analytics cần nhận timezone rõ ràng để tránh lệch ngày.
