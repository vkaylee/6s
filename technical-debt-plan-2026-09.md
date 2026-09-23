# Kế hoạch xử lý nợ kỹ thuật 6S — 2026-09

## Goal

Đóng 5 nợ P0 đang chặn production (quality gate, fail-closed secret, backup/restore, graceful shutdown, CVE dependency), rồi xử lý P1 data/observability, cuối cùng là P2 frontend. Không đổi hành vi nghiệp vụ ngoài phạm vi từng task.

## Nguyên tắc

- Mỗi task có owner, file sở hữu, và gate quan sát được.
- Không sửa generated code (`internal/db/queries.sql.go`, `web/src/api/generated/`) bằng tay.
- Không suppress lint diện rộng; exception phải hẹp và có removal date.
- Slice đổi runtime phải có test fail-trước-fix; slice config phải có kiểm tra fail-closed.
- Chỉ chạy full suite ở task integration; slice khác chạy gate hẹp.

## Wave 0 — Baseline (chỉ đọc)

- [x] **W0.1 Chốt baseline.** Chạy và lưu output: `./leedevkit test server --lint-only`, `--unit-only`, `./leedevkit test web --lint-only`, `--unit-only`, `./leedevkit test all`, `./scripts/security-scan.sh web`, `cd web && bun run openapi:drift`. → Verify: server/web lint+unit, security go/web/sbom/secrets, OpenAPI drift PASS; full suite vẫn bị chặn bởi image E2E stale thiếu `/usr/local/bin/migrate`.
- [ ] **W0.2 Debt register.** Ghi mỗi finding thành row: ID, severity, owner, file:line, risk, acceptance evidence, due date. → Verify: 5 P0 có owner và ngày; không row nào thiếu acceptance.

## Wave 1 — P0 (chặn release)

- [x] **W1.1 Bật lại golangci-lint.** Thêm task `golangci-lint run` vào `leedevkit_run_lint()` (`.leedevkit/scripts/_test_modules.py:272`), dùng image `6s-go-dev:1.23` (đã cài ở `.compose/Dockerfile.golang:15`). → Verify: `./leedevkit test server --lint-only` liệt kê `golangci-lint` và fail khi có finding thật; `.test_logs/Linting_golangci-lint.log` không còn `command not found`.
- [x] **W1.2 Dọn finding golangci-lint.** Xử lý thật `errcheck`/`gosec`/`revive`/`gocyclo` theo `.golangci.yml`. → Verify: lint exit 0; mọi `//nolint` mới có lý do cụ thể. *(Không thêm `//nolint` nào.)*
- [x] **W1.3 Fail-closed encryption key.** `cmd/server/main.go:66-74`: không cho `cipher == nil` chạy production; reject `APP_ENCRYPTION_KEY` thiếu/sai trừ khi dev flag; `internal/config/config.go` validate key base64/raw 32 byte. → Verify: `internal/config/config_test.go` có case thiếu key → fail.
- [ ] **W1.4 Audit secret hiện hữu.** Kiểm tra config AI/notification trong DB: cái nào mã hóa, cái nào plaintext; re-encrypt nếu có; ghi audit log. → Verify: script/query đếm được số bản ghi plaintext trước và sau = 0. **(Chưa làm: cần DB production.)**
- [x] **W1.5 Chặn placeholder secret.** `internal/config/config.go` + `.env.prod.example`: từ chối giá trị mẫu (`change-me`, `changeme`, `development-`, `dev-secret`) khi không bật dev. → Verify: test `JWT_SECRET=change-me-in-production-min-32-bytes` fail.
- [x] **W1.6 Graceful shutdown.** `cmd/server/main.go`: `signal.NotifyContext` cho SIGTERM/SIGINT, `server.Shutdown` deadline 30s, hủy worker/cron context qua variadic `parentCtx`, đóng DB sau cùng. → Verify: `go test ./cmd/server` PASS; smoke test SIGTERM thật chưa chạy.
- [x] **W1.7 Vá CVE dependency web.** `vite` 5.4.11 → 6.4.3 (esbuild 0.21.5 → 0.25.12); `js-yaml` ghim 4.3.2 qua overrides/resolutions. → Verify: `./scripts/security-scan.sh web` exit 0 với `{}`; web lint + unit PASS.
- [ ] **W1.8 Backup + restore.** `scripts/backup.sh` (pg_dump -Fc, rsync uploads, GPG AES-256, retention 30/180/1095, restore validate FK trên DB disposable). → Verify: **script chưa chạy thật** — thiếu `BACKUP_DESTINATION`, key file, network, credentials. Cần operator chạy và ghi RPO/RTO.

## Wave 2 — P1 (data, hiệu năng, vận hành)

- [x] **W2.1 Index `score_logs(issue_id)`.** Migration `000023_issue_score_indexes` + baseline `sql/schema.sql`. → Verify: server unit PASS; EXPLAIN ANALYZE chưa chạy (không có DB).
- [x] **W2.2 Đồng bộ schema baseline.** Thêm đủ 14 index migration-backed vào `sql/schema.sql`; exact definitions giữ nguyên.
- [x] **W2.3 Bound export.** `internal/report/handler.go`, `internal/report/service.go`, `sql/queries.sql`: date range mặc định 30 ngày, tối đa 90 ngày, SQL/service cap 10.000 dòng; giữ XLSX contract. → Verify: report handler tests + server unit PASS; output vẫn tạo archive in-memory nhưng bounded 10.000 rows.
- [x] **W2.4 Giảm fan-out issue detail/SSE.** `internal/issue/{hub,service,handler,workflow}.go` + `ListVisibleIssueEventRecipients`: một query audience cho mọi subscriber/event thay vì `GetIssueByID` mỗi subscriber. → Verify: `TestIssueService_Broadcast_QueryCountIndependentOfSubscribers` + server unit PASS.
- [ ] **W2.5 Report/masterdata query bound.** Report KPI/category/trend/tag queries đã thêm time window + site/visibility boundary; scoring retroactive đã batch insert một round-trip/issue. Masterdata list queries vẫn cần site boundary.
- [ ] **W2.6 Resilience outbound.** AI + LDAP đã có retry bounded/classifier/backoff/jitter; notification client và circuit breaker còn pending. → Verify: AI/LDAP focused tests + server lint/unit PASS.
- [x] **W2.7 Logging + request ID (một phần).** `internal/observability/logging.go` redact credential key-values/DSN. Còn lại: chuyển `log.Printf`/`log.Fatalf` production path, cột `request_id` cho `system_audit_logs`, audit login.
- [x] **W2.8 Readiness kiểm tra storage.** `internal/observability/readiness.go` + `cmd/server/main.go`: `/api/ready` kiểm tra DB + ghi thử storage, trả `checks.database`/`checks.storage` + uptime/version, giữ `status`/`db` cũ; `/api/health` dependency-free. → Verify: `TestReadinessStorageFailureReturns503` (503 khi storage unwritable) và `TestReadinessHealthyDatabaseAndStorageReturns200` PASS.

## Wave 3 — P2 (frontend)

- [x] **W3.1 A11y modal/drawer.** `CreateIssueModal.tsx`, `OfflineOutboxDrawer.tsx`, `ImageAnnotatorModal.tsx`, `SetupSuperadminModal.tsx`: role=dialog/aria-modal/labelledby, Escape, Tab trap, focus restore, aria-label nút đóng; `App.tsx` truyền `onClose`. → Verify: web lint + typecheck + unit PASS; **chưa có keyboard E2E test** cho 4 surface này.
- [x] **W3.2 Một transport API.** Generated client làm transport cho các issue/tag/location/leaderboard/report callers; auth refresh, envelope, multipart boundary giữ nguyên. → Verify: web lint/unit + OpenAPI drift PASS.
- [x] **W3.3 Xóa type/master data trùng.** Core Issue/Tag/Location/leaderboard types dùng generated contracts hoặc compatibility adapter tối thiểu; residual manual `ScoreLogItem` giữ vì OpenAPI schema thiếu fields backend trả.
- [ ] **W3.4 i18n.** Đã migrate 10 production strings và giữ locale parity; còn hardcoded strings trong `syncEngine.ts`/`api/client.ts` cần xử lý.

## Wave 4 — Gate

- [x] **W4.1 CI đồng nhất.** `.github/workflows/ci.yml`: bỏ pin cứng 0.7.7, đọc `version` từ `leedevkit.toml` (0.7.9). → Verify: workflow parse; chưa chạy trên GitHub.
- [x] **W4.2 Security scan hermetic.** `scripts/security-scan.sh`: host-first, container fallback, fail-closed khi thiếu tool/runtime. → Verify: `go|web|sbom|secrets` đều PASS.
- [ ] **W4.3 Integration test PostgreSQL không skip im lặng.** `TEST_DB_DSN` chưa cấp; cần owner/reason/expiry metadata cho skip.
- [ ] **W4.4 Full gate.** Rebuild `6s-e2e-server:local` đã sửa blocker `/usr/local/bin/migrate`; full gate chạy được 12 E2E, 9 pass, 3 fail: `imageZoom` preview close, `clipboard-paste` sync response timeout, `responsibility-smoke` responsibility text missing.

## Dependencies

- W0 trước tất cả.
- W1.1 → W1.2. W1.3 → W1.4. W1.8 độc lập.
- W2.1 → W2.2 (cùng đụng `sql/schema.sql`). W2.3, W2.5 đụng `sql/queries.sql` → serialize.
- W3.2 trước W3.3 và W3.4 (cùng đụng `web/src/api`).
- W4 sau W1–W3.
- Shared file cần một owner duy nhất: `cmd/server/main.go`, `sql/queries.sql`, `sql/schema.sql`, `.env.prod.example`, `web/src/api/*`, `.github/workflows/ci.yml`.

## Done When

- [x] `./leedevkit test server --lint-only` chạy `golangci-lint` và xanh.
- [x] Production không khởi động được khi thiếu/sai secret; cipher production không nil.
- [x] Export có date/time/row bounds; hot query có index. EXPLAIN cần DB thật.
- [x] `sql/schema.sql` chứa đủ index migration-backed.
- [ ] Audit log có `request_id`; không còn log text thô ở production path.
- [x] Modal chính đạt keyboard/focus/ARIA.
- [x] Không thêm `t.Skip`/`nolint` mới trong wave này.
- [ ] `./leedevkit test all` xanh trên cây sạch.

## Notes
- Ghi chú 2026-09-23: commit `31adafc` xử lý P0 security/reliability/N+1/readiness/a11y/offline/supply-chain/backup scaffold; commit `bfdaa27` xử lý report bounds, report query scope, scoring batch insert, AI/LDAP retry, API transport/types, i18n audit.
- Chưa xác minh: backup/restore thật; EXPLAIN ANALYZE; TEST_DB_DSN integration; CI trên GitHub.
- Full gate hiện không xanh: E2E infrastructure blocker đã sửa bằng image rebuild; còn 3 behavioral failures nêu W4.4.
- Residual: debt register; audit secret DB production; backup drill; masterdata site boundary; notification resilience/circuit breaker; request_id audit persistence; remaining i18n literals; 3 E2E behavioral failures.
- Độ phủ 80.1% dựa nhiều vào mock driver; không tính bằng chứng SQL/schema/FK.
