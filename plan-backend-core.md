# Plan: Backend Core & Database

## Goal
Thiết lập Go chi router, config, pool database pgx/v5, AES-256-GCM cipher và migrations.

## Tasks
- [x] Cập nhật `go.mod` thêm `chi/v5`, `pgx/v5`, `golang-jwt`, `crypto/argon2`, `uuid`, `ldap/v3` → Verify: `go mod tidy` không báo lỗi
- [x] Tạo `internal/config/config.go` đọc env & CLI flags (`-port`, `-db-dsn`, `-data-dir`, `APP_ENCRYPTION_KEY`) → Verify: Unit test parse flag và env
- [x] Tạo `internal/crypto/cipher.go` mã hóa/giải mã AES-256-GCM 32-byte key cho credentials at-rest → Verify: Test mã hóa roundtrip và reject key sai độ dài
- [x] Tạo `internal/database/database.go` cấu hình `database/sql` + `pgx/v5/stdlib` pool (Max 25, MinIdle 5) → Verify: Test init DB pool
- [x] Tạo migration files `internal/database/migrations/000001_init_schema.{up,down}.sql` từ `sql/schema.sql` → Verify: Migration up và rollback down thành công
- [x] Tạo `internal/response/response.go` chuẩn hóa API envelope `{data}` / `{error}` → Verify: Unit test render JSON đúng format Mục 5.3
- [x] Tạo endpoint `GET /api/health` trong `cmd/server/main.go` trả HTTP 200 kèm trạng thái DB → Verify: `curl localhost:8080/api/health` trả `{"data":{"status":"ok","db":"ok"}}`

## Done When
- [x] `./leedevkit test server --lint-only` không có lỗi
- [x] `./leedevkit test server --unit-only` pass 100%
