# Domain Enum Migration

Status: Approved

## Goal
Chuẩn hóa toàn bộ giá trị phân loại cố định thành typed enum ở Go/TypeScript, giữ JSON wire format là string, và bảo toàn dữ liệu/API hiện hữu.

## Constraints and Interfaces

- Không chuyển text tự do, tên, email, URL, mã định danh, model name, permission code hoặc audit target thành enum.
- Không dùng PostgreSQL native `ENUM`; giữ `VARCHAR + CHECK` để dễ mở rộng và rollback.
- API JSON giữ nguyên các giá trị string hiện tại; không đổi sang số, không rename value.
- Mọi migration phải có `down.sql`; không drop column/table.
- Không sửa generated files thủ công; regenerate bằng wrapper dự án.
- sqlc boundary phải có kiểu rõ ràng hoặc conversion tập trung; không rải cast/raw comparison trong domain logic.
- Trước khi reject giá trị lạ, phải audit dữ liệu thật và mapping giá trị legacy.

## Tasks

- [x] **1. Freeze contract inventory** — chốt danh sách enum và owner: P0 (`AuthSource`, `Role`, `IssueStatus`, `CauseStatus`), P1 (`Category`, `CauseType`, `VisibilityClass`, `ResponsibilityType`, `TagStatus`, `TagReviewAction`, `TargetType`, notification channel/status), P2 (`EventType`, `LocationSnapshotSource`, `SyncStatus`, `Locale`). Loại trừ text tự do, audit action động và event arbitrary routing khỏi enum cứng.

- [x] **2. Audit data and legacy values** — chạy audit trực tiếp `SELECT DISTINCT` trên `6s_db`. Kết quả:
  - `issues.category`: `1S` (3), `6S` (1)
  - `issues.cause_type`: `CONDITION` (4) — không có `MANUAL`
  - `issues.visibility_class`: `SAFETY_RESTRICTED` (1), `SITE_PUBLIC` (3)
  - `issues.status`: `OPEN` (3), `PENDING_REVIEW` (1)
  - `issues.cause_status`: `UNVERIFIED` (4)
  - `users.role`: `ADMIN` (1), `USER` (1), `SUPERADMIN` (1)
  - `users.auth_source`: `LOCAL` (3)
  - `tags.status`: `PENDING` (1), `APPROVED` (159)
  - `score_logs.target_type`: `LOCATION` (12)
  - `notification_outbox.status`: `CANCELLED` (2), `FAILED` (9)
  - `notification_outbox.channel`: `WXPUSHER` (4), `LAN_WEBHOOK` (7)
  - `cron_task_logs.status`: `SUCCESS` (45)
  - Không có giá trị rác, không có giá trị lạ cần migration data.

- [x] **3. Establish shared typed domain values** — tạo package domain enums tại `internal/issue`, `internal/auth`, `internal/notification`, `internal/masterdata`. Sử dụng typed enum cho DTO, handler validation và IsValid helpers.

- [x] **4. Tighten persistence constraints** — đồng bộ `sql/schema.sql` với `CHECK (cause_type IN ('CONDITION', 'BEHAVIOR'))`, `CHECK (visibility_class IN ('SITE_PUBLIC', 'SAFETY_RESTRICTED'))`. Xác nhận 25 migration runtime `up.sql` đang có trạng thái `applied` và `validate` thành công.

- [x] **5. Align OpenAPI and generated TypeScript** — cập nhật `openapi.yaml` bổ sung `cause_type`, `visibility_class` và enum constraints; sinh lại TypeScript client và kiểm tra không có drift (`openapi:drift` passed).

- [x] **6. Tighten frontend domain types** — export `web/src/types/enums.ts` và export qua `web/src/types/index.ts`. Áp dụng các constants enum cho React pages, components, hooks và tests.

- [x] **7. Remove known drift and invalid fixtures** — cập nhật test fixtures và AI validation tests sang enum hợp lệ. Sửa kiến trúc frontend enum check (`web/test/enumPolicy.test.ts` passed).

- [x] **8. Full verification and rollout** —
  - `./leedevkit test server --lint-only`: PASSED
  - `./leedevkit test server --unit-only`: PASSED
  - `./leedevkit test web --lint-only`: PASSED
  - `./scripts/_bun.sh test test/enumPolicy.test.ts`: PASSED
  - Focused test suites cho changed path: PASSED

## Done When

- [x] P0/P1 domain classifications typed end-to-end outside intentional DB/generated boundaries.
- [x] API remains backward compatible with existing string values.
- [x] Production data audit has zero unexplained values before constraints/rejection.
- [x] `sql/schema.sql`, migrations, OpenAPI, generated TS, Go, and frontend types agree.
- [x] Invalid classification values fail at request/domain/DB boundaries without partial writes.
- [ ] Full unrelated web test suite isolation issues resolved (documented: 39 tests fail on shared global state / happy-dom leak across non-isolated bun run).
## Review Focus

- `visibility_class` must remain authoritative for issue visibility; enum refactor must not weaken authorization filters.
- Avoid sqlc import cycles and accidental generated-model API breakage.
- Locale normalization must choose one canonical persisted representation before rejecting old values.
- Outbox/event enums must preserve retry, cancellation, and SSE compatibility.
- Unknown future enum values must fail safely at trust boundaries, not silently become privileged/default states.
