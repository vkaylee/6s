# Plan: Auth & Identity (Domain 2)

## Goal
Xây dựng module Auth & RBAC theo Mục 6.1, 6.5, 5.2 của SPEC.md gồm: Argon2id password hash, JWT Access/Refresh tokens với Token Rotation, RBAC middleware 4 cấp, Rate Limiter/Account lockout, Active Directory/LDAP client tích hợp JIT provisioning, và các API endpoints `/api/auth/*` cùng `/api/config/ad*`.

## Tasks
- [x] Task 1: Tạo `internal/auth/password.go` với Argon2id hash & verify (`golang.org/x/crypto/argon2`) → Verify: Unit test hash, verify thành công và verify thất bại với mật khẩu sai
- [x] Task 2: Tạo `internal/auth/token.go` quản lý JWT Access Token (claims tối giản `sub`, `exp`, `iat`) và Refresh Token băm SHA-256 → Verify: Unit test issue token, parse validation, expiration, và token rotation hashing
- [x] Task 3: Cập nhật `sql/queries.sql` và sinh lại `internal/db` với các query User, RefreshToken, ADConfig, SystemAuditLog → Verify: sqlc sinh mã không lỗi, compile pass
- [x] Task 4: Tạo `internal/auth/limiter.go` xử lý Rate Limit (5 lần/phút/IP) và Account Lockout (10 lần sai/15 phút/tài khoản) → Verify: Unit test rate limit trigger 429 và lockout trigger sau 10 lần
- [x] Task 5: Tạo `internal/auth/ldap.go` kết nối AD/LDAPS/StartTLS, bind auth, tìm kiếm user, và map groups sang roles → Verify: Unit test mock/interface LDAP test success, invalid credentials (code 49) và connection fallback
- [x] Task 6: Tạo `internal/auth/middleware.go` xác thực JWT Bearer, nạp user role từ DB/context, và enforce RBAC 4 cấp (`RequireRole`) → Verify: Unit test middleware với valid token, expired token, và role check 403
- [x] Task 7: Tạo `internal/auth/handler.go` triển khai endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/revoke`, `GET /api/auth/sessions` → Verify: Test HTTP handler với envelope chuẩn Mục 5.3
- [x] Task 8: Tạo endpoints cấu hình AD: `GET /api/config/ad`, `PUT /api/config/ad`, `POST /api/config/ad/test` (kèm mã hóa `bind_password` bằng AES-256-GCM) → Verify: Test API get/put/test config với quyền Admin, cấm role khác (403)
- [x] Task 9: Đăng ký toàn bộ auth & config routes vào `cmd/server/main.go` → Verify: Test tích hợp gọi login, refresh, me/sessions, ad config
- [x] Task 10: Chạy kiểm thử toàn diện server (`./leedevkit test server --lint-only` và `./leedevkit test server --unit-only`) → Verify: 100% tests pass và không lỗi linter

## Done When
- [x] Tất cả unit tests cho auth, token, rbac, ldap, handler pass 100%
- [x] `./leedevkit test server --lint-only` và `./leedevkit test server --unit-only` pass không lỗi
