# Chuyển auth sang HttpOnly cookie

Status: Approved

## Goal
Loại token khỏi JavaScript/IndexedDB, dùng cookie `HttpOnly; Secure; SameSite=Strict` cho auth, để ảnh tải bằng native `<img>` trên iPhone và giảm rủi ro XSS đọc token.

## Quyết định kiến trúc
- Giữ JWT access token 15 phút và refresh-token rotation 7 ngày; chỉ đổi kênh lưu/truyền, không tự mở rộng sang session store hoặc blocklist.
- Cookie server-only: `6s_access` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api`) và `6s_refresh` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`); không đặt `Domain`.
- Cookie CSRF không `HttpOnly`: `6s_csrf`; client gửi lại qua `X-CSRF-Token`. Kiểm tra double-submit, `Origin`/`Referer` cho request unsafe, không dùng wildcard CORS.
- `POST /login`, `/refresh`, `/setup` không trả access/refresh token trong JSON. `POST /refresh` đọc refresh cookie; `POST /revoke` không body cho logout.
- Thêm `GET /api/auth/me` để khôi phục user sau reload. Offline chỉ giữ profile không nhạy cảm; không giữ refresh token.
- Clean cutover: bỏ đọc `Authorization: Bearer` và body `refresh_token`; cập nhật toàn bộ web, E2E, OpenAPI, SPEC trong cùng release. Không thêm fallback bearer. Cần maintenance/coordinated deploy; zero-downtime cần duyệt phương án compatibility tạm thời riêng.

## Threat model và acceptance security
- **Tài sản:** access/refresh credential, session cookie, CSRF token, ảnh protected, user profile.
- **Biên tin cậy:** browser JavaScript/Service Worker, same-origin API, reverse proxy TLS, DB refresh-token hash.
- **Abuse:** XSS đọc credential, CSRF mutation, cookie gửi qua HTTP/cross-origin, ảnh bị cache/public, stale PWA gọi contract cũ.
- **Kiểm soát bắt buộc:** auth cookie không xuất hiện trong response body/log/query/referrer; production luôn `Secure`; auth response `Cache-Control: no-store`; media vẫn authorization server-side; cookie auth không thay đổi permission checks.

## Tasks
- [ ] Task 1: Thêm cookie/CSRF primitives và cấu hình secure-cookie theo production/dev; viết unit tests cho flags, clear-cookie, missing/mismatched CSRF, unsafe Origin → Constraints: dùng `crypto/rand`/constant-time compare, không log raw token → Interface: `internal/auth`, config, middleware → Verify: server unit tests cho success, missing, mismatch, cross-origin, production flags.
- [ ] Task 2: Chuyển auth handlers/middleware sang cookie contract; thêm `/api/auth/me`; login, setup, refresh set/rotate cookies; revoke logout clear cookies; bỏ token khỏi JSON và `RefreshRequest` body → Constraints: refresh rotation/reuse detection, inactive-user denial, authorization hiện hữu giữ nguyên → Interface: `internal/auth/handler.go`, `middleware.go`, route registration, tests → Verify: handler/middleware tests kiểm tra `Set-Cookie`, cookie authentication, rotation, replay, revoke.
- [ ] Task 3: Cập nhật OpenAPI, generated SDK và SPEC cho `CookieAuth`/`RefreshCookie`, `/auth/me`, CSRF header, response mới; regenerate bằng wrapper → Constraints: generated files chỉ sinh từ `openapi.yaml`, không để Bearer/body refresh còn trong contract → Interface: `openapi.yaml`, `web/src/api/generated`, `SPEC.md` → Verify: OpenAPI check/generate-drift và grep contract không còn bearer/refresh-token response cũ.
- [ ] Task 4: Refactor web auth client/store: `credentials: include`, CSRF bootstrap/header cho mutation, refresh retry không token, `/auth/me` restore; xóa `accessToken`, `refresh_token`, IndexedDB auth secret; giữ offline profile và draft behavior → Constraints: network-offline giữ offline grace, 401 thật không giả thành offline, không lưu credential trong LocalStorage/IndexedDB → Interface: `web/src/api/client.ts`, auth store/API, IndexedDB migration, `App.tsx` callers → Verify: web unit tests cho cookie credentials, CSRF, refresh dedupe, reload/offline/401.
- [ ] Task 5: Đổi `AuthenticatedImage` sang native `<img src="/api/...">` cho URL server; giữ `data:`/`blob:` chỉ cho local draft; xóa fetch→Blob→FileReader/data URL path và cập nhật error UI/callers/tests → Constraints: same-origin media cookie, không đưa token vào URL, không phá preview local/upload/export → Interface: image hook/component, photo URL callers → Verify: browser smoke trên viewport iPhone-like: media request có cookie, ảnh render, 401/403/404 fallback và retry không loop.
- [ ] Task 6: Cập nhật service worker/deploy contract: bump cache name, giữ `/api`, `/uploads` network-only, enforce HTTPS/Secure cookies, document same-origin API/CORS exact-origin requirement → Constraints: không cache protected media/API, không wildcard credentialed CORS → Interface: `web/public/sw.js`, Caddy/deploy docs/config → Verify: browser reload nhận bundle mới; network panel chứng minh media/API không đi qua cache.
- [ ] Task 7: Migrate all tests and consumers: server tests, web tests, Playwright helpers/specs, logout/session flows, direct API scripts; remove stale bearer/token assertions → Constraints: no compatibility shim, preserve permission/error/offline behavior → Interface: all repository callsites → Verify: targeted server/web/E2E tests and contract drift check.
- [ ] Task 8: Security review and release cutover runbook → Constraints: review must cover CSRF, XSS residual risk, cookie flags, stale SW/old tabs, proxy TLS, cross-origin deployment → Interface: release/deployment documentation and approval record → Verify: independent security review findings have disposition; coordinated deploy smoke with login, reload, refresh, logout, protected image, offline draft, permission denial.
- [ ] Task 9: Full verification → Constraints: use repository wrappers only → Interface: complete repository → Verify: `./leedevkit test all` passes; report focused checks, browser smoke, skipped checks, residual risk.

## Done When
- [ ] Browser JS and IndexedDB never receive/store access or refresh token.
- [ ] Authenticated API and protected media requests work with cookies; native image loading works on iPhone-like browser.
- [ ] CSRF and cookie security acceptance criteria pass.
- [ ] OpenAPI/SPEC/generated client/tests/callers agree on cookie contract.
- [ ] Offline drafts still work without pretending cached profile proves online authorization.
- [ ] Full regression gate passes.

## Review Focus
- Cookie `Secure` behavior behind Caddy TLS and direct `DEV_INSECURE` development.
- CSRF token bootstrap for login/refresh and multipart mutations.
- Stale Service Worker/old tab behavior during clean cutover.
- Native `<img>` error-status loss versus current detailed media error UI.
- Residual JWT access lifetime after logout; blocklist remains out of scope and must be documented.

## Notes
Plan intentionally does not migrate JWT to server-side sessions, add MFA, or redesign authorization. Those changes need separate scope and review.
