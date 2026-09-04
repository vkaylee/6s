# Plan: Verification & Binary Embed (Domain 7)

## Goal
Hoàn tất đóng gói nhúng tĩnh React PWA (`web/dist`) vào Go binary đơn nhất qua `//go:embed`, phục vụ SPA fallback routing, endpoint static uploads `/uploads/*`, endpoint tải chứng chỉ CA `GET /cert/ca.crt`, và chạy kiểm thử toàn diện `./leedevkit test all` pass 100% theo Mục 10.1, 10.4 và Mục 11 của SPEC.md.

## Tasks
- [x] Task 1: Tạo `cmd/server/spa.go` nhúng thư mục `../../web/dist` bằng `//go:embed`, thiết lập `http.FileServer` kèm SPA routing fallback về `index.html` cho các client routes -> Verify: Request đường dẫn web trả về index.html và assets MIME type đúng
- [x] Task 2: Đăng ký endpoint phục vụ ảnh tải lên `/uploads/*` từ thư mục `storageDir` -> Verify: Request `/uploads/...` trả về file hoặc 404
- [x] Task 3: Đăng ký endpoint `GET /cert/ca.crt` phục vụ tải file chứng chỉ CA nội bộ (SPEC.md Mục 10.1) -> Verify: Request `/cert/ca.crt` trả về HTTP 200/404 an toàn
- [x] Task 4: Cập nhật `cmd/server/main_test.go` kiểm thử toàn diện: Health endpoint, SPA index fallback, API routing -> Verify: `go test -v ./cmd/server` pass 100%
- [x] Task 5: Chạy `./leedevkit test server --lint-only` và `./leedevkit test server --unit-only` -> Verify: Server pass 100%
- [x] Task 6: Chạy `./leedevkit test web --lint-only` và `./leedevkit test web --unit-only` -> Verify: Web pass 100%
- [x] Task 7: Chạy kiểm thử toàn diện `./leedevkit test all` -> Verify: Pass 100% không có lỗi
- [x] Task 8: Cập nhật `plan-master.md` đạt 100% `[x]` và commit Git hoàn tất hệ thống -> Verify: Git status clean

## Done When
- [x] Toàn bộ task trong `plan-verification.md` đạt `[x]`
- [x] `./leedevkit test all` pass 100%
- [x] `plan-master.md` đánh dấu hoàn tất 100% các domain
