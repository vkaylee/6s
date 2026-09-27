# Xoá mềm và khôi phục issue

Status: Approved

## Phạm vi và quy tắc
- Yêu cầu đã chốt: issue đã xoá không tính điểm. Phạm vi: xoá mềm + khôi phục; không xoá vĩnh viễn, không tự động dọn dữ liệu, không thêm nghiệp vụ chốt kỳ.
- Mặc định đề xuất để duyệt: chỉ admin/superadmin được xoá và khôi phục qua quyền riêng theo RBAC hiện hữu; xoá bắt buộc lý do; áp dụng mọi trạng thái issue; thao tác online-only.
- Giữ nguyên trạng thái nghiệp vụ, ảnh, tags, score_logs và audit. Khôi phục về trạng thái trước xoá. Tách dấu xoá khỏi status; không dùng INVALID thay xoá.
- Issue đã xoá không xuất hiện trong danh sách, thống kê, báo cáo/export thông thường; không cho sửa, chuyển trạng thái, truy cập chi tiết/ảnh qua quyền đọc thông thường. Admin có bộ lọc “Đã xoá” và chi tiết chỉ đọc để khôi phục.
- Điểm LOCATION và USER: loại mọi khoản thưởng/phạt/retro_adjust gắn với issue đã xoá, không thay đổi điểm nền. Giữ ledger để đối chiếu; không ghi thêm khoản đảo điểm hay thưởng khi xoá/khôi phục. Khôi phục làm các khoản điểm gốc có hiệu lực lại theo ngày ghi nhận gốc và cách tính hiện hữu, không chuyển điểm sang kỳ hiện tại.
- Khảo sát schema, scoring, report và cron chưa thấy cơ chế chốt kỳ: tổng hiện tính từ score_logs, không có snapshot điểm đã khoá. Không dựng quy trình duyệt điều chỉnh. Nếu phát hiện cơ chế chốt kỳ trong triển khai, dừng phần liên quan để chốt contract.
- Không phát sinh phạt hoặc thông báo mới trong lúc issue bị xoá. Giữ nguyên created_at và ngưỡng quá hạn 48 giờ; xoá không tạm dừng hoặc đặt lại đồng hồ quá hạn. Khôi phục không chạy phạt ngay và không truy thu ngày đã bỏ qua; lần quét kế tiếp chỉ xét ngày quét hiện tại theo quy tắc bên dưới. Không phát lại thông báo cũ; thông báo đã gửi không thể thu hồi.

## Quyết định chi tiết cần duyệt cùng plan
1. **Phạt quá hạn và đổi quy tắc điểm.** Cron hiện quét issue OPEN quá 48 giờ, ghi một khoản phạt theo ngày địa phương, chống trùng bằng `(issue_id, rule_key, penalty_date)`; catch-up xét ngày hiện tại, không duyệt từng ngày đã bỏ lỡ (`internal/cron/cron.go`, `sql/queries.sql`). Giữ cách tính này: lúc ghi phạt phải kiểm tra issue còn hoạt động trong transaction. Nếu khôi phục trước lần quét của ngày hiện tại, issue đủ điều kiện có thể bị phạt ngày đó; không chia điểm theo giờ. Nếu ngày đó đã có khoản phạt trước khi xoá, không ghi thêm. Không thêm lịch sử khoảng xoá hoặc mốc resume vì không tính bù theo khoảng thời gian. Giữ toàn bộ ledger cũ khi khôi phục, kể cả retro_adjust đã tồn tại; thay đổi quy tắc trong lúc xoá không điều chỉnh issue đó và không được áp bù khi khôi phục. Sự kiện mới sau khôi phục dùng cấu hình lúc phát sinh. Sau này admin chủ động chạy điều chỉnh hồi tố khi issue đang hoạt động vẫn theo nghiệp vụ hiện hữu.
2. **Transaction và cạnh tranh.** Tái dùng `BeginTx`/`WithTx` tại `internal/db/issue_tx.go`. Xoá/khôi phục, mutation có side effect điểm, cron và điều chỉnh hồi tố phải khoá cùng hàng issue (`SELECT ... FOR UPDATE`), rồi kiểm tra quyền/phạm vi, dấu xoá và version phù hợp trước ghi. Khoá issue trước score/outbox; xử lý batch theo ID tăng dần. Mutation/ghi điểm commit trước xoá được giữ trong ledger nhưng không còn tính vào tổng sau xoá; xoá commit trước thì mutation trả lỗi, cron/điều chỉnh bỏ qua. Không được dùng danh sách ứng viên cũ để ghi điểm sau khi issue đã xoá. Xoá cập nhật metadata, tăng version, audit và huỷ outbox trong một transaction; audit lỗi thì rollback toàn bộ. Khôi phục cũng atomic, không tạo score log. Chỉ phát SSE sau commit.
3. **Thông báo đang chờ.** Thêm trạng thái terminal `CANCELLED` cho outbox, không dùng `SENT` hoặc giả lỗi gửi. Transaction xoá chuyển các hàng `PENDING`/`SENDING` sang `CANCELLED`; giữ hàng đã gửi và dữ liệu đối chiếu. Worker phải kiểm tra trạng thái outbox và dấu xoá ngay trước gửi; retry, mark-sent và tạo fallback phải có điều kiện trạng thái, không hồi sinh hàng đã huỷ. Khôi phục không đưa hàng CANCELLED về PENDING. Không giữ DB lock trong lúc gọi HTTP. Ranh giới cam kết: request đã vượt kiểm tra cuối trước khi xoá vẫn có thể được bên ngoài nhận sau commit; không thể bảo đảm thu hồi hoặc không gửi tuyệt đối nếu thiếu hỗ trợ từ hệ thống nhận.
4. **API và quyền đọc.** Thêm `issue:view_deleted` bên cạnh `issue:delete`/`issue:restore`; seed cả ba chỉ cho ADMIN/SUPERADMIN, vẫn giữ giới hạn site và visibility hiện hữu, không mở quyền xuyên site. `GET /api/issues?deletion=active|deleted`, mặc định `active`; không thêm chế độ gộp. `deleted` yêu cầu quyền xem đã xoá, dùng pagination/filter hiện hữu và count cùng điều kiện. Chi tiết, media, ledger theo issue dùng `deletion=deleted` để đọc issue đã xoá với quyền tương ứng; đường đọc mặc định trả 404. Quyền xem không tự cấp quyền xoá/khôi phục. Ledger đối chiếu giữ điểm gốc nhưng đánh dấu issue đã xoá, không đưa vào tổng đang tính điểm. Người có quyền xoá nhưng thiếu quyền xem đã xoá nhận receipt tối thiểu, không nhận chi tiết đã xoá.
   - `POST /api/issues/{id}/delete`: JSON `{reason, expected_version}`; trim lý do, yêu cầu 1–1000 Unicode code points; `expected_version` là số nguyên dương bắt buộc. `POST /api/issues/{id}/restore`: JSON `{expected_version}`. Trả 200 với envelope hiện hữu: `{data: {id, version, deleted_at}}`; deleted_at là timestamp sau xoá, null sau khôi phục. Frontend refetch theo quyền thay vì dựa vào response chi tiết.
   - Chưa đăng nhập: 401; thiếu quyền action/bộ lọc: 403; ID không tồn tại hoặc ngoài scope: 404; payload/tham số sai: 400; version cũ hoặc sai trạng thái nguồn (xoá issue đã xoá, khôi phục issue đang hoạt động): 409. Dùng error envelope `{error: {code, key, message}}` và i18n hiện hữu; công bố mã conflict trong OpenAPI. Không tiết lộ version/metadata ngoài scope.
   - Gọi lặp với cùng request trả 409 sau lần thành công đầu, không thêm audit/điểm hoặc tăng version nữa. Khi mất response, UI tải lại trạng thái trước khi cho gửi tiếp; không tự retry mutation bằng version mới. Mutation thông thường trên issue đã xoá trả 404; client offline giữ lỗi/conflict có thể xử lý, không tạo issue thay thế.
5. **Migration và rollback.** Cột xoá nullable, không backfill dữ liệu cũ; CHECK đảm bảo metadata xoá đồng bộ, khôi phục xoá ba giá trị hiện tại nhưng audit giữ các lần trước. Migration bổ sung outbox CANCELLED và quyền mới theo cấu trúc hiện hữu. Down migration phải kiểm tra trước mọi DDL và fail atomically nếu còn issue đã xoá hoặc outbox CANCELLED; không tự restore/purge/chuyển trạng thái để vượt kiểm tra. Khi cần quay về bản ứng dụng không hiểu dấu xoá, dừng ghi và dùng bản sửa tiến hoặc khôi phục backup đã kiểm chứng; không chạy bản cũ trực tiếp trên dữ liệu còn xoá mềm. Kiểm thử up trên dữ liệu cũ, down khi sạch và down bị chặn không làm mất dữ liệu.

**Hệ quả điểm cần hiển thị:** xoá loại cả thưởng lẫn phạt; xoá issue bị trừ điểm có thể làm tổng tăng, xoá issue được thưởng có thể làm tổng giảm. Không hứa tổng thay đổi đúng số điểm ledger vì còn clamp và cửa sổ tuần/tháng. Dialog xoá nêu rõ ảnh hưởng này; khôi phục tính lại theo ngày gốc.

## Các bước triển khai
1. [x] **Dữ liệu và quyền.** Migration `000025_issue_soft_delete`, schema metadata xoá, CHECK, outbox `CANCELLED`, permissions và rollback guard hoàn tất.
2. [x] **SQL và điểm.** Active/deleted filters, score/report exclusions, retained ledger/photos, score locking and SQLC generation hoàn tất.
3. [x] **Service và API.** Atomic delete/restore, row lock, version, audit, RBAC/site scope, explicit deleted reads, error contract and post-commit SSE hoàn tất.
4. [x] **Luồng nền và đồng bộ.** Outbox cancellation, worker state checks, cron/score writer skipping, offline conflict handling hoàn tất.
5. [x] **UI và contract người dùng.** Deleted filter, read-only detail, restore, reason/score warning, media, SSE refresh, recovery lock, generated client and E2E flow hoàn tất.
6. [x] **Kiểm chứng cuối.** Server unit/lint, web unit/lint, OpenAPI drift, focused DB regression and fresh soft-delete E2E đạt. Browser smoke xác nhận xoá, read-only deleted detail, Restore and restored state.
   - Bổ sung ca biên: xoá/khôi phục nhiều lần cùng ngày chỉ giữ một phạt/ngày; qua nhiều ngày và qua ranh giới tuần/tháng không backfill hoặc chuyển ngày ledger; đổi rule trong lúc xoá không sửa điểm cũ; sự kiện mới dùng rule mới; đối chiếu cả thưởng, phạt và clamp.
   - Kiểm thử cạnh tranh có đồng bộ transaction, không sleep: cron đã lấy ứng viên rồi issue bị xoá; close/retro-adjust đua với xoá ở cả hai thứ tự commit; audit lỗi; worker đã claim rồi bị cancel, không retry/fallback sau restore. Kiểm tra cleanup orphan vẫn giữ ảnh đã xoá.
   - Kiểm thử trust boundary và contract: sai site dù có quyền, chỉ có quyền xem nhưng không restore, mặc định 404 cho detail/media/ledger đã xoá, filter không hợp lệ, lý do whitespace/Unicode/vượt giới hạn, version thiếu/sai/cũ, request lặp không thêm audit; migration down bị chặn trước DDL. Smoke xác nhận cảnh báo xoá khoản phạt có thể làm điểm tăng.

Phụ thuộc: 1 → 2 → 3 → 4/5 → 6. Chốt contract API trước khi nối UI; chỉ chạy kiểm chứng tích hợp khi các phần đã hoàn tất.

## Lệnh kiểm chứng dự kiến
```sh
./leedevkit test server --lint-only
./leedevkit test server --unit-only
./leedevkit test web --lint-only
./leedevkit test web --unit-only
COMPOSE_PROFILES=e2e-web ./leedevkit manage prebuild
./leedevkit test web --e2e-only --pattern 'soft-delete'
```

Đạt khi: xoá/khôi phục nhất quán giữa dữ liệu, quyền, UI, điểm và báo cáo; dữ liệu lịch sử còn nguyên; không cộng điểm trùng hoặc tạo side effect mới cho issue đang xoá. Đã triển khai và kiểm chứng. Prebuild profile e2e-web trước E2E vì runtime dùng image chứa binary/frontend, không mount source.
