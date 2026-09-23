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

- [x] **W0.1 Chốt baseline.** Chạy và lưu output: `./leedevkit test server --lint-only`, `--unit-only`, `./leedevkit test web --lint-only`, `--unit-only`, `./leedevkit test all`, `./scripts/security-scan.sh web`, `cd web && bun run openapi:drift`. → Verify: mọi lệnh có kết quả lưu lại, kể cả lệnh fail; ghi rõ lệnh nào fail vì môi trường (thiếu binary/`node_modules/.bin`) và lệnh nào fail vì code. *(2026-09-23: server lint/unit, web lint/unit, security go/web/sbom/secrets, openapi drift: PASS.)*
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

- [x] **W2.1 Index `score_logs(issue_id)`.** Migration `000023_issue_score_indexes` + baseline `sql/schema.sql`. → Verify: `./scripts/_go.sh test ./internal/database` PASS; **EXPLAIN ANALYZE chưa chạy (không có DB)**.
- [ ] **W2.2 Đồng bộ schema baseline.** Còn 14 index chỉ có trong migration: `idx_issues_asset`, `idx_issues_assigned_team`, `idx_issues_assignee`, `idx_issues_cause_team`, `idx_issues_location_snapshot_recorded_at`, `idx_issues_site_visibility`, `idx_location_memberships_location`, `idx_location_memberships_user`, `idx_locations_site`, `idx_refresh_tokens_user`, `idx_tags_active`, `idx_team_memberships_user`, `idx_teams_site`, `idx_users_site`.
- [ ] **W2.3 Bound export.** `internal/report/handler.go:68-129`, `internal/report/service.go:12`, `sql/queries.sql:883-893`: bắt buộc date range, hạ trần, stream output, giới hạn concurrency. → Verify: request 100k dòng bị từ chối hoặc stream với heap bounded; đo heap trước/sau. **(Chưa làm.)**
- [x] **W2.4 Giảm fan-out issue detail/SSE.** `internal/issue/{hub,service,handler,workflow}.go` + `ListVisibleIssueEventRecipients`: một query audience cho mọi subscriber/event thay vì `GetIssueByID` mỗi subscriber. → Verify: `TestIssueService_Broadcast_QueryCountIndependentOfSubscribers` + `go test ./internal/issue` PASS.
- [ ] **W2.5 Report/masterdata query bound.** `sql/queries.sql:849-881`: thêm time window và site boundary; batch insert ở `internal/scoring/service.go:362-390`. → Verify: 4 query report đều có điều kiện thời gian; batch insert 1 round-trip. **(Chưa làm.)**
- [ ] **W2.6 Resilience outbound.** Retry có phân loại + backoff + jitter + circuit breaker cho AI (`internal/ai/service.go`), LDAP (`internal/auth/ldap.go`), notification (`internal/notification/client.go`). → Verify: test dependency-failure cho từng client; breaker mở/đóng đúng; không retry non-idempotent.
- [x] **W2.7 Logging + request ID (một phần).** `internal/observability/logging.go` redact credential key-values/DSN. → Còn lại: chuyển `log.Printf`/`log.Fatalf` production path sang observability; cột `request_id` cho `system_audit_logs`; audit login.
- [x] **W2.8 Readiness kiểm tra storage.** `internal/observability/readiness.go` + `cmd/server/main.go`: `/api/ready` kiểm tra DB + ghi thử storage, trả `checks.database`/`checks.storage` + uptime/version, giữ `status`/`db` cũ; `/api/health` dependency-free. → Verify: `TestReadinessStorageFailureReturns503` (503 khi storage unwritable) và `TestReadinessHealthyDatabaseAndStorageReturns200` PASS.

## Wave 3 — P2 (frontend)

- [x] **W3.1 A11y modal/drawer.** `CreateIssueModal.tsx`, `OfflineOutboxDrawer.tsx`, `ImageAnnotatorModal.tsx`, `SetupSuperadminModal.tsx`: role=dialog/aria-modal/labelledby, Escape, Tab trap, focus restore, aria-label nút đóng; `App.tsx` truyền `onClose`. → Verify: web lint + typecheck + unit PASS; **chưa có keyboard E2E test** cho 4 surface này.
- [ ] **W3.2 Một transport API.** Chọn generated client; migrate call site `apiClient` theo module; validate envelope tại boundary; bỏ URL hardcode. → Verify: `bun run openapi:drift` xanh (**đang xanh**); typecheck xanh. **(Migration chưa làm.)**
- [ ] **W3.3 Xóa type/master data trùng.** `web/src/types/index.ts:146-184,201-375`, `web/src/api/operations.ts:7-19`: dùng generated type; chuyển `S_CATEGORIES`/`DEFAULT_SCORING_RULES` sang i18n/backend. **(Chưa làm.)**
- [ ] **W3.4 i18n.** `web/src/sync/syncEngine.ts:195,204,226`, `web/src/api/client.ts:143,153,166`: đưa chuỗi hardcode vào locale; xóa dead key. **(Chưa làm — guard i18n hiện vẫn PASS.)**

## Wave 4 — Gate

- [x] **W4.1 CI đồng nhất.** `.github/workflows/ci.yml`: bỏ pin cứng 0.7.7, đọc `version` từ `leedevkit.toml` (0.7.9). → Verify: workflow parse; **chưa chạy trên GitHub**.
- [x] **W4.2 Security scan hermetic.** `scripts/security-scan.sh`: host-first, container fallback (`6s-go-dev:1.23`, `oven/bun:1.4.1`), fail-closed khi thiếu tool/runtime; `run_scanner` mount Go cache. → Verify: `go|web|sbom|secrets` đều exit 0 trên máy này (secrets qua `.gitleaks.toml` allowlist cho `_test.go`).
- [ ] **W4.3 Integration test PostgreSQL không skip im lặng.** `internal/database/postgres_migration_test.go:23`, `internal/db/user_tx_setup_test.go:28`: wrapper tự cấp `TEST_DB_DSN`; skip lại phải có issue/owner/reason/expiry. → Verify: `./scripts/_go.sh test ./internal/database -run '^TestPostgres'` hiện vẫn `TEST_DB_DSN is not set` (5 skip). **(Chưa làm.)**
- [ ] **W4.4 Full gate.** → Verify: `./leedevkit test all` + openapi drift + toàn bộ security scan xanh trên cây sạch. **(Đang chạy `./leedevkit test all`.)**

## Dependencies

- W0 trước tất cả.
- W1.1 → W1.2. W1.3 → W1.4. W1.8 độc lập.
- W2.1 → W2.2 (cùng đụng `sql/schema.sql`). W2.3, W2.5 đụng `sql/queries.sql` → serialize.
- W3.2 trước W3.3 và W3.4 (cùng đụng `web/src/api`).
- W4 sau W1–W3.
- Shared file cần một owner duy nhất: `cmd/server/main.go`, `sql/queries.sql`, `sql/schema.sql`, `.env.prod.example`, `web/src/api/*`, `.github/workflows/ci.yml`.

## Done When

- [x] `./leedevkit test server --lint-only` chạy `golangci-lint` và xanh.
- [x] Production không khởi động được khi thiếu/sai secret (config validate + `log.Fatalf` trong `main.go`). Không ghi plaintext: cipher luôn khác nil ở production.
- [ ] Export có bound bộ nhớ/thời gian; hot query có index và EXPLAIN.
- [ ] `sql/schema.sql` khớp migration baseline.
- [ ] Audit log có `request_id`; không còn log text thô ở production path.
- [ ] Modal chính đạt keyboard/focus/ARIA.
- [ ] Mọi `t.Skip`/`nolint` mới có owner, issue, removal date.
- [ ] `./leedevkit test all` xanh trên cây sạch.

## Notes
- Ghi chú 2026-09-23: `scripts/backup.sh`, `scripts/security-scan.sh`, `web/package.json`+lock, CI pin, migration 000023, `internal/issue/*` N+1 fix, `internal/observability/*`, 4 modal a11y, `syncEngine` SYNCING recovery đã áp dụng trong worktree này.
- Chưa xác minh: `scripts/backup.sh` chưa từng chạy end-to-end (thiếu storage/key/credentials); EXPLAIN ANALYZE cho `idx_score_logs_issue` chưa chạy; `TEST_DB_DSN` chưa cấp nên 5 test PostgreSQL vẫn skip; CI chưa chạy trên GitHub.
- Residual: 14 index lệch giữa `sql/schema.sql` và migration (W2.2); export report chưa bound (W2.3); report/masterdata query chưa bound (W2.5); resilience outbound chưa làm (W2.6); audit `request_id` chưa làm (W2.7); W3.2–W3.4 frontend chưa làm.
- Độ phủ 80.1% hiện dựa nhiều vào mock driver; không tính là bằng chứng cho SQL/schema/FK.
