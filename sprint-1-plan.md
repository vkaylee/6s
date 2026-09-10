# Sprint 1 — Toàn vẹn dữ liệu, xác thực, vận hành

## Mục tiêu
Sửa các lỗi có thể gây dữ liệu không nhất quán hoặc bỏ qua cơ chế xác thực; không thay đổi schema và không chạy migration phá hủy.

## Phạm vi

- [x] **Issue/tags nguyên tử** — `internal/issue/service.go`, `internal/db/`
  - Xác minh lỗi tag mutation.
  - Gộp cập nhật issue, xóa tags, thêm tags vào cùng transaction.
  - Chỉ phát notification/SSE sau commit.
  - Regression: delete/insert failure rollback toàn bộ; conflict không phát side effect.
- [x] **Export dùng auth client chung** — `web/src/pages/ReportsPage.tsx`, `web/src/api/client.ts`
  - Dùng `fetchAuthenticatedBlob` hoặc transport hiện có.
  - Giữ filter, filename, CSV contract.
  - Regression: access token hết hạn refresh thành công; refresh thất bại/403 không tạo download.
- [x] **Startup/readiness** — `cmd/server/main.go`, healthcheck
  - Xác minh chính sách degraded-start.
  - Liveness 200 độc lập DB; readiness 503 khi DB unavailable.
  - Regression: lỗi DB không lộ DSN/credentials.
- [x] **LDAP boundary** — `internal/auth/ad_handler.go`, `internal/auth/ldap.go`
  - Auth guard trước parse/dial.
  - Validate host/port; cho phép private IP và custom port hợp lệ.
  - Bounded LDAP operation timeout.
  - Giữ TLS policy hiện có; không whitelist tùy tiện.
  - Regression: unauthorized không dial; malformed config bị từ chối; explicit `false` không bị config cũ ghi đè.

## Verification

```sh
./leedevkit test server
./leedevkit test web
./leedevkit test all
```

Chưa xác minh export qua Chromium thật: browser trên host thiếu `libcups.so.2`; lần thử trong container thiếu executable Chromium. Gate Playwright hiện tại không được coi là bằng chứng E2E export. Việc đóng gói browser và kiểm thử ứng dụng thật thuộc Sprint 3.

## Bằng chứng triển khai

- `internal/db/issue_tx_test.go`: gọi phương thức transaction thật qua SQL test driver; lỗi delete/insert rollback, thành công commit. Không phải kiểm thử PostgreSQL thật.
- `internal/issue/service_test.go`: tag failure không phát SSE/notification.
- `web/test/reportsPage.test.tsx`: token hết hạn refresh rồi download; refresh lỗi hoặc 403 không download.
- `cmd/server/main_test.go`: readiness DB lỗi trả response an toàn. Giữ nguyên chính sách degraded-start, không sửa startup production.
- `internal/auth/ldap_test.go`, `internal/auth/handler_test.go`: validation LDAP, explicit `false`, từ chối request chưa xác thực.
- Không chạy migration phá hủy hoặc triển khai production.

## Done when

- Transaction, auth export, LDAP validation, readiness đều có bằng chứng kiểm thử.
- Server/web/full gates đạt.
- Không có migration destructive hoặc thay đổi production ngoài phạm vi.
