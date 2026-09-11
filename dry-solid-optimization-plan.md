# Kế hoạch tối ưu DRY/SOLID

Phạm vi: lấp khoảng trống sau audit DRY/SOLID. Phần đã nằm trong `technical-debt-remediation-plan.md` (app-architecture #17, api-contract #13, error-handling #3/#4, a11y #15) **không lặp lại ở đây**; plan này chỉ chứa phần chưa ai sở hữu.

## Nguyên tắc

- Ưu tiên data integrity trước duplication. Không refactor hình thức khi chưa sửa rollback.
- Không sửa generated code (`internal/db/queries.sql.go`): đổi `sql/queries.sql` rồi chạy `./scripts/_sqlc.sh generate`.
- Mỗi slice một nhóm file, một kết quả quan sát được.
- Slice chạm runtime phải có regression test chứng minh rollback.
- Shared file cần integration owner: `cmd/server/main.go`, `internal/issue/service.go`, `internal/auth/handler.go`, `internal/db/issue_tx.go`.

## Bằng chứng hiện trạng

Đã có sẵn pattern atomic đúng chuẩn, dùng làm mẫu:

| File | Transaction |
|---|---|
| `internal/db/issue_tx.go:10-49` | `PatchIssueWithTagsAtomic` |
| `internal/db/user_tx.go:10-44` | `UpdateUserAdminAtomic` |
| `internal/db/permission_tx.go:10-39` | `ReplaceRolePermissionsAndAudit` |
| `internal/db/auth_refresh.go:20-54` | `RotateRefreshToken` |

Rủi ro chưa xử lý:

- `internal/issue/service.go:155-179` — `SyncIssue` tạo issue rồi insert tag, queue notification, ghi score riêng; lỗi side effect chỉ `log.Printf`, vẫn trả success.
- `internal/issue/service.go:313-340` — `ResolveIssue` lưu file ảnh trước DB update; DB fail để orphan file.
- `internal/auth/admin_handler.go:300-350` — `UpdateUser` type-assert atomic store; fallback chạy update → revoke → audit thành ba bước rời.

## Wave A — Atomicity (P0)

21. **issue-create-atomic** — `internal/db/issue_tx.go`, `sql/queries.sql`, `internal/issue/service.go`.
   - Thêm `CreateIssueWithSideEffects` trong transaction: issue, `issue_tags` (+`tags.use_count`), `notification_outbox` (2 channel), `score_logs`.
   - `SyncIssue` dùng transaction; side effect lỗi → rollback, trả `AppError`, không nuốt lỗi.
   - Photo save giữ trước transaction (transaction không bao được filesystem); thêm cleanup ảnh khi DB rollback.
   - Gate: test rollback (tag insert fail) chứng minh không còn `issue_tags`/outbox/score rác; `./leedevkit test server --unit-only`.

22. **issue-resolve-atomic** — `internal/db/issue_tx.go`, `internal/issue/service.go`.
   - Bọc `ResolveIssue`/`ForceResolveIssue` + `score_logs` (nếu có) trong transaction; thêm `RemoveAfterPhoto` để xóa file khi rollback.
   - Gate: test DB update fail xác nhận `photo_after` đã bị xóa, không orphan.

23. **admin-update-atomic-only** — `internal/auth/admin_handler.go`.
   - Bỏ fallback non-atomic: `AdminStore` phải thoả `atomicAdminStore`, khởi tạo fail-fast nếu không.
   - Gate: test update + revoke + audit cùng thành công hoặc cùng rollback; không còn nhánh ba bước.

## Wave B — Interface Segregation / SRP (P1)

24. **issue-store-split** — `internal/issue/service.go:68-96`, `internal/issue/handler.go:26-38`.
   - Tách `Store` (~25 method) thành port theo use case: `IssueStore` (CRUD/list/status), `TagStore`, `ScoringStore`, `NotificationStore`, `AuditStore`, `DirectoryStore` (user/location), `TranslationStore`.
   - Handler phụ thuộc `Service` mỏng theo nhóm endpoint nếu hữu ích; không tách cơ học nếu làm tăng wiring.
   - Gate: `service_test.go` mock nhỏ hơn theo port; `./leedevkit test server --unit-only`.

25. **auth-store-split** — `internal/auth/handler.go:21-38`.
   - Tách thành `UserLookupStore`, `TokenStore`, `LDAPConfigStore`, `AuditStore`.
   - Gate: auth unit tests pass, mock giảm method.

26. **issue-service-srp** — `internal/issue/service.go` (~948 dòng).
   - Tách theo use case: workflow (sync/resolve/close/reopen/invalidate/patch), visibility policy, projection, translation cache, scoring/notification side effects.
   - Giữ nguyên chữ ký `Service` interface để handler không đổi.
   - Gate: `handler_test.go` + `service_test.go` pass không sửa assertion.

## Wave C — DRY (P2)

27. **handler-param-helpers** — `internal/response/params.go` (mới), callers trong `internal/*/handler.go`.
   - `ParseID(r, "id")` gom ~10 chỗ lặp `strconv.ParseInt(chi.URLParam(r, "id"))` (`internal/issue/handler.go`, `internal/scoring/handler.go`, `internal/auth/*_handler.go`).
   - `ParsePageLimit(q, defaultLimit, maxLimit)` gom `internal/issue/handler.go:74-86`.
   - Gate: `./leedevkit test server --lint-only`; grep xác nhận không còn pattern lặp.

28. **null-and-mapper-helpers** — `internal/issue/service.go`, `internal/scoring/service.go`.
   - Helper `nullInt32FromPtr(*int32) sql.NullInt32` thay 3 chỗ lặp (`~400-403, 453-456, 498-501`).
   - Gom mapper `ScoreLogItem` dùng chung cho `GetIssueScoreLogs` và `GetTargetScoreLogsInCycle` (`internal/scoring/service.go:220-248, 270-306`).
   - Gate: scoring/issue unit tests pass.

29. **audit-builder** — `internal/auth/audit.go`, callers `internal/auth/handler.go`.
   - Hàm dựng audit params (masked target, IP, user-agent) thay 5 chỗ lặp (`~206-212, 345-350, 470-475, 530-536, 683-689`).
   - Gate: auth tests pass; audit payload không đổi (so sánh trước/sau).

30. **sql-visibility-dedup** — `sql/queries.sql`.
   - Predicate visibility lặp tại dòng `418`, `431`, `768`. Cân nhắc SQL function/view `visible_issues_for(site_id, user_id, role)` để một nguồn sự thật.
   - Chỉ làm nếu plan query không xấu đi; nếu không, ghi chú lý do giữ lặp.
   - Gate: regenerate SQLC không drift; query-plan/regression test `internal/db/queries_test.go`.

## Wave D — Verification

31. **final-gate**
   - `./leedevkit test server --lint-only`
   - `./leedevkit test server --unit-only`
   - Smoke rollback: insert tag fail → không có issue/outbox/score rác, không còn ảnh mồ côi.
   - Smoke resolve fail → `photo_after` bị xóa.

## Phụ thuộc và ownership

- Wave A độc lập, làm trước.
- 21 và 22 cùng chạm `internal/db/issue_tx.go` → một owner, tuần tự.
- 24 trước 26 (tách port rồi mới tách implementation).
- 27–29 độc lập, chạy song song sau Wave A.
- 30 độc lập nhưng cần regenerate SQLC → chạy một mình.
- Tất cả trước 31.

## Ngoài phạm vi (đã có plan khác)

- Tách `App.tsx`, `useDashboardData.ts`, modal focus hook → `technical-debt-remediation-plan.md` #15, #17.
- Thống nhất API boundary frontend → #13, #18.
- Structured logging/PII masking → #11.
- Test/doc/release gate → #19, #20.

## Definition of Done

- Không còn side effect issue chạy ngoài transaction với lỗi bị nuốt.
- Không còn nhánh admin update non-atomic.
- Port interface không quá 8 method/interface.
- Duplicate đã liệt kê được gom hoặc có lý do giữ kèm ghi chú.
- `./leedevkit test server --lint-only` và `--unit-only` pass; smoke rollback có bằng chứng output.


---

## Trạng thái thực thi (2026-09-12)

Tất cả hạng mục 21–31 đã xử lý. Bằng chứng:

| # | Hạng mục | Kết quả |
|---|---|---|
| 21 | issue-create-atomic | `CreateIssueWithSideEffects` (db/issue_tx.go) nhận builder callbacks để payload/score có issue ID thật; `SyncIssue` dùng transaction, cleanup ảnh khi rollback. Test `TestCreateIssueWithSideEffects_RollbackOnSideEffectFailure` (4 case, gồm tag/outbox/score fail) PASS. |
| 22 | issue-resolve-atomic | `ResolveIssueAtomic`; `ResolveIssue` xoá `photo_after` khi transaction fail. Test `TestIssueService_ResolveFailureRemovesOrphanAfterPhoto` PASS. |
| 23 | admin-update-atomic-only | `AdminStore.UpdateUserAdminAtomic`; bỏ nhánh 3 bước; xoá `revokeChangedSessions`/`auditUserUpdate`. |
| 24 | issue-store-split | `Store` compose từ `Reader`/`Writer`/`TagStore`/`ScoringStore`/`NotificationStore`/`AuditStore`/`DirectoryStore`/`TranslationStore`. |
| 25 | auth-store-split | `Store` compose từ `UserReader`/`UserProvisioning`/`TokenStore`/`LDAPConfigStore`/`AuditStore`. |
| 26 | issue-service-srp | `service.go` (950→192 dòng) tách thành `workflow.go`, `projection.go`, `sideeffects.go`, `helpers.go`. Chữ ký `Service` không đổi. |
| 27 | handler-param-helpers | `response.ParseIDParam` + `ParsePageLimit`; migrate 14 điểm gọi ở issue/auth/scoring handler; xoá `ParseID` chết. |
| 28 | null-and-mapper-helpers | `expectedVersion` gom 3 chỗ; `mapScoreLogRow` gom 2 mapper scoring (đã có sẵn từ trước). |
| 29 | audit-builder | `maskedAuditSource` (auth/audit.go) gom 4 chỗ dựng cặp IP/User-Agent đã mask. |
| 30 | sql-visibility-dedup | **Giữ nguyên lặp — có chủ đích.** Xem ghi chú dưới. |
| 31 | final-gate | `--lint-only` PASS, `--unit-only` PASS, rollback smoke có test. |

### Ghi chú #30 (sql-visibility-dedup)

Ba predicate `ListIssuesFiltered` (dòng 418), `CountIssuesFiltered` (431), `ListIssuesForExport` (768) **byte-identical**. Đã cân nhắc tách thành SQL function `visible_issues_for(site_id, user_id, role)`.

Quyết định **giữ lặp**, lý do:
- `sqlc` sinh typed Go từ literal SQL; function nhận `(site_id, user_id, role)` buộc mọi query phải truyền thêm tham số và mất khả năng planner push-down predicate vào index theo từng query.
- `ListIssuesForExport` có `LIMIT 100000` và join khác; một function dùng chung sẽ materialize trung gian thay vì inline predicate.
- Không có Postgres trong môi trường local để chạy `EXPLAIN` xác nhận plan không xấu đi — cổng của #30 yêu cầu điều đó.
- Ba bản sao nằm cạnh nhau trong cùng file, cùng nguồn gốc migration `000017`; rủi ro lệch thấp và dễ soát bằng diff byte.

Điều kiện nâng cấp: khi có Postgres CI, thêm regression test plan cho 3 query rồi mới chuyển sang function.
