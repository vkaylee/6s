# Plan: Scoring & Outbox Worker (Domain 4)

## Goal
Xây dựng module Scoring (Health Score khu vực theo tuần, Leaderboard cá nhân theo tháng, cấu hình điểm, hồi tố điểm delta) và Worker nền (Transactional Outbox Worker gửi WxPusher & Webhook LAN, Cron Tasks: quét phạt quá hạn OVERDUE_PENALTY_SCAN chạy bù 00:00, dọn dẹp ảnh mồ côi CLEANUP_ORPHANS, dọn dẹp audit logs CLEANUP_AUDIT_LOGS) theo Mục 4.6, 5.3.D, 5.3.E, 6.4, 6.6, 8, 10.2, 10.3 của SPEC.md.

## Tasks
- [x] Task 1: Cập nhật `sql/queries.sql` và sinh code `internal/db`: Leaderboard locations (tổng điểm tuần + count open + overdue), Leaderboard reporters (tổng điểm tháng + count valid + safety), Get/Upsert notification_configs, Outbox atomic claim (UPDATE ... WHERE id IN (SELECT FOR UPDATE SKIP LOCKED)), Outbox status updates, Insert/Get cron_task_logs, Overdue issues query -> Verify: `sqlc generate` thành công
- [x] Task 2: Tạo `internal/scoring/service.go` đóng gói thuật toán tính điểm tuần HealthScore ($\max(0, \min(120, 100 + \sum points))$), Leaderboard reporters, CRUD scoring rules, Recalculate hồi tố điểm delta chèn bản ghi `retro_adjust` bảo toàn sổ cái -> Verify: Unit tests cho công thức tính điểm và hồi tố delta
- [x] Task 3: Tạo `internal/scoring/handler.go` xử lý endpoints: `GET /api/leaderboard/locations`, `GET /api/leaderboard/reporters`, `GET /api/config/scoring`, `PUT /api/config/scoring` (Admin) -> Verify: Unit tests response envelope đúng format Mục 6.4
- [x] Task 4: Tạo `internal/notification/client.go` đóng gói HTTP client gửi tin qua WxPusher API (`https://wxpusher.zjiecode.com/api/send/message`) và Webhook LAN (Markdown phổ quát DingTalk/Lark/Mattermost) kèm giải mã secret at-rest AES-256-GCM -> Verify: Unit test mock HTTP sender cho WxPusher & Webhook
- [x] Task 5: Tạo `internal/notification/worker.go` hiện thực Transactional Outbox Worker: event-driven notifyCh + ticker 30s, atomic lease claim 120s, exponential backoff, max 5 retries, tự động fallback LAN_WEBHOOK khi WxPusher cạn retry -> Verify: Unit test outbox worker claim, retry backoff và fallback
- [x] Task 6: Tạo `internal/notification/handler.go` xử lý endpoints: `GET /api/config/notifications`, `PUT /api/config/notifications`, `POST /api/config/notifications/test` (Admin, mã hóa AES-256-GCM token/webhook URL) -> Verify: Unit test admin config endpoints
- [x] Task 7: Tạo `internal/cron/cron.go` xử lý tác vụ định kỳ: `OVERDUE_PENALTY_SCAN` (quét issue OPEN > 48h lúc 00:00 kèm chạy bù khi khởi động), `CLEANUP_ORPHANS` (dọn dẹp ảnh mồ côi lúc 01:00), `CLEANUP_AUDIT_LOGS` (dọn audit > 12 tháng), ghi nhận `cron_task_logs` -> Verify: Unit test quét bù quá hạn idempotent
- [x] Task 8: Tích hợp scoring routes, notification routes, khởi động background Outbox Worker và Cron Runner vào `cmd/server/main.go` -> Verify: Tích hợp server biên dịch và chạy kiểm thử
- [x] Task 9: Chạy toàn bộ kiểm thử server (`./leedevkit test server --lint-only` và `./leedevkit test server --unit-only`) -> Verify: Pass 100% không lỗi linter

## Done When
- [x] Toàn bộ unit tests cho scoring, outbox worker, notification client, cron runner pass 100%
- [x] `./leedevkit test server --lint-only` và `./leedevkit test server --unit-only` pass không lỗi
