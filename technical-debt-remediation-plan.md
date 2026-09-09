# Kế hoạch xử lý nợ kỹ thuật 6S

## Nguyên tắc

- Mỗi subagent chỉ sở hữu một nhóm file và một kết quả quan sát được.
- Không sửa generated code bằng tay. Không suppress lint diện rộng.
- Subagent đọc `.leedevkit/templates/CLAUDE.base.md` và rulebook liên quan trước khi sửa.
- Không chạy full suite khi các slice khác chưa tích hợp. Integration owner là người duy nhất xử lý conflict/cherry-pick.
- Slice thay đổi runtime phải có regression test; slice docs/config phải có kiểm tra cấu hình tương ứng.

## Wave 0 — Baseline

1. **baseline-verification** — chỉ đọc. Ghi nhận lint/unit/E2E/security hiện trạng, blocker môi trường, finding còn hợp lệ. Không sửa.

## Wave 1 — Backend độc lập

2. **go-format-and-lint** — `internal/db/queries_test.go`, `internal/i18n/i18n.go`, `internal/issue/service_test.go`, `internal/scoring/*_test.go`. Sửa gofmt, shadow, ineffassign, exported comments trong phạm vi test. Gate: `./leedevkit test server --lint-only` không còn finding test-format.

3. **error-return-handling** — `internal/response/response.go`, `internal/database/database.go`, `internal/db/auth_refresh.go`. Xử lý Encode/Close/Rollback/Exec; giữ response contract. Gate: focused Go tests + lint không còn errcheck production ở các file này.

4. **auth-error-handling** — `internal/auth/middleware.go`, `internal/auth/ldap.go`, `internal/auth/admin_handler.go`. Xử lý type assertion, Close, Marshal, audit-log errors; chỉ tách helper khi giảm complexity rõ ràng. Gate: auth unit tests + lint các file sở hữu.

5. **database-connect-test** — `internal/database/database_test.go`. Làm `TestDatabase_ConnectError` fail thật khi `Connect` không trả lỗi; không phụ thuộc DB đang chạy. Gate: test fail với behavior sai, pass với implementation đúng.

6. **config-security** — `internal/config/config.go`, `internal/auth/token.go`, startup validation, `.env.example`. Fail closed DB/JWT/TLS theo môi trường; test thiếu secret, secret ngắn, TTL. Gate: focused config/token tests; security review bắt buộc.

7. **migration-readiness** — migration runner, migration SQL/runbook, health/readiness, Docker healthcheck. Version tracking, restart-safe, readiness kiểm tra DB. Gate: migration tests, readiness smoke, `./leedevkit test server --unit-only`.

8. **auth-refresh-hardening** — refresh rotation atomic, reuse detection, token-family revoke, bootstrap authorization, query-token decision. Gate: success, revoked, replay race, transaction failure; security review bắt buộc.

9. **db-query-performance** — issue list/detail, leaderboard, export, `sql/queries.sql`, generated SQLC qua generator. Batch-fetch, O(1) query shape, bound/stream export. Gate: query-count regression + service tests + generated drift.

10. **scoring-rules** — scoring lifecycle/config/query/seed. Đọc `scoring_rules`, xử lý missing/invalid, không award im lặng. Gate: configured/default/missing/invalid tests.

## Wave 2 — Platform và contract

11. **observability-errors** — logging/response middleware, workers/cron, SSE grouping. Structured logs, request ID, PII masking, safe client errors, timeout đúng. Gate: log/error/SSE focused tests; không lộ secret/PII.

12. **ci-supply-chain** — `.github/workflows/ci.yml`, `leedevkit.toml`, `.golangci.yml`, `scripts/security-scan.sh`. Bảo đảm lint/unit/E2E/security/SBOM/secrets; thêm OpenAPI drift và web build nếu wrapper hỗ trợ. Gate: validate YAML/config, chạy representative local job; ghi rõ tool thiếu.

13. **api-contract** — `openapi.yaml` nếu cần, `web/src/api/client.ts`, `operations.ts`, config generator, contract tests. Một transport, base URL qua env, envelope validation, regenerate client. Gate: `openapi:drift`, typecheck, API contract tests.

## Wave 3 — Frontend độc lập rồi tích hợp

14. **frontend-i18n** — locale JSON, hardcoded UI strings, i18n guard/tests. Ba locale parity, runtime strings đều dịch. Gate: i18n test + `./leedevkit test web --lint-only`.

15. **frontend-a11y** — Biome a11y, dialog/drawer/combobox/icon controls. Keyboard, focus trap/restore, labels, Escape, ARIA. Gate: focused UI tests + web lint/typecheck.

16. **admin-page-split** — theo `admin-page-split.md`: locations/tags routes/pages, role guard, menu, locale titles. Gate: route/role/CRUD tests + web lint/typecheck.

17. **app-architecture** — chỉ sau 13–16. Tách `App.tsx` theo feature boundary, xóa duplicate types/state, giữ route/SSE/offline behavior. Gate: route/state regression tests + web unit/typecheck.

18. **web-regressions** — chỉ sau integration branch. Sửa các regression đã chứng minh: user shape, refresh Authorization, locale wording, navigation, permission loading. Gate: `bun test`, typecheck, OpenAPI drift; không sửa backend.

## Wave 4 — Test, docs, release gate

19. **test-quality-and-docs** — test mock yếu, skipped E2E metadata, duplicate Playwright config, README, retention/backup evidence. Không đổi production behavior ngoài testability cần thiết. Gate: test lỗi thật, skip có owner/reason/expiry, docs khớp config.

20. **integration-verification** — branch tích hợp, không merge `master`. Cherry-pick theo phụ thuộc; regenerate artifacts; resolve conflict có review. Gate cuối:
   - `./leedevkit test server --lint-only`
   - `./leedevkit test server --unit-only`
   - `./leedevkit test web --lint-only`
   - `./leedevkit test web --unit-only`
   - `./leedevkit test all`
   - OpenAPI drift, security scan, auth/readiness/token-leakage smoke tests

## Phụ thuộc và ownership

- Shared file cần integration owner: `cmd/server/main.go`, `internal/auth/handler.go`, `.env.example`, `web/biome.json`, generated OpenAPI/SQLC.
- Wave 1 slices 2–5, 9–10 chạy song song khi không chạm shared file.
- 6 trước 8; 6, 7, 12 trước 19; 13 trước 14; 13–15 trước 16; 16 trước 17; tất cả trước 20.
- Mỗi subagent báo: files, behavior, tests, exact command/result, unresolved risk. Không commit file ngoài ownership.

## Definition of Done

- Go lint zero finding hoặc exception hẹp có owner/removal date.
- Không còn test nuốt failure ở boundary đã chạm.
- Contract/generated artifacts không drift.
- Security findings có disposition; backup/DR evidence có owner và ngày review.
- Residual debt được ghi thành issue, không để trong code dưới dạng TODO mơ hồ.
