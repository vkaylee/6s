# ĐẶC TẢ KỸ THUẬT: HỆ THỐNG QUẢN LÝ VÀ BÁO CÁO 6S ISSUE

## 1. TỔNG QUAN
Hệ thống webapp mobile-first hỗ trợ nhân viên nhà xưởng ghi nhận và theo dõi xử lý các vấn đề 6S (Sàng lọc, Sắp xếp, Sạch sẽ, Săn sóc, Sẵn sàng, An toàn).
- **Môi trường hoạt động:** Mạng nội bộ (LAN), thiết bị di động thường xuyên mất kết nối khi di chuyển ngoài vùng phủ sóng Wi-Fi.
- **Mục tiêu cốt lõi:** Ghi nhận lỗi offline tức thì, đồng bộ tự động khi có mạng, thông báo qua WeChat cá nhân.

---

## 2. KIẾN TRÚC HỆ THỐNG

```
[Mobile Browser / PWA]
  │  ├── 1. Nén ảnh (Canvas 1280px, JPEG 0.7)
  │  ├── 2. Lưu local draft (IndexedDB)
  │  └── 3. Auto-sync khi có mạng
  │
  ▼ HTTPS / TLS (Mạng LAN nội bộ - Yêu cầu bắt buộc cho PWA, Camera)
[Go Backend Server] (On-Premise)
  │  ├── TLS Termination (Internal CA / Caddy / Reverse Proxy)
  │  ├── Auth & Identity:
  │  │   ├── Internal DB Auth (Argon2id, QR badge)
  │  │   └── Active Directory / LDAP (LDAPS/StartTLS, bind authentication, auto-provision user, sync role/group)
  │  ├── Business Logic (RBAC 4 cấp, JWT Access + Refresh Token, Rate Limiting)
  │  ├── Concurrency Control: database/sql connection pool (`pgx/v5/stdlib`) + Optimistic Locking
  │  ├── Storage: PostgreSQL 18 (pg_dump 6h) + Local File System ./uploads (rsync delta lên NAS mỗi giờ; Strict Sanitized UUIDs)
  │  ├── Worker dọn dẹp (Orphan files & Archival) & Cron phục hồi (Cron Ledger)
  │  └── Transactional Outbox Worker (Outbound HTTP + Persistent Webhook Fallback)
  │
  ├──► LDAPS://ad.factory.lan:636 [Active Directory Domain Controller]
  ├──► POST https://wxpusher.zjiecode.com/api/send/message [WeChat Cá Nhân]
  └──► POST Webhook LAN [DingTalk / Lark / Feishu / Mattermost On-Premise Fallback]
```

---

## 3. CƠ SỞ DỮ LIỆU (POSTGRESQL 18) & CHIẾN LƯỢC MIGRATION

### 3.1. Cấu hình Kết nối Go PostgreSQL
```go
// Cấu hình kết nối bắt buộc trong Go:
// DSN: postgres://user:password@host:5432/6s_db?sslmode=disable (hoặc verify-full khi có cert)
// Go backend: Chuẩn hóa database/sql kết hợp pgx/v5 driver (github.com/jackc/pgx/v5/stdlib) để tương thích 100% sqlc (sql_package: database/sql).
// Cấu hình pool dùng API database/sql:
//   db.SetMaxOpenConns(25), db.SetMaxIdleConns(5)
//   db.SetConnMaxLifetime(15 * time.Minute)
//   db.SetConnMaxIdleTime(5 * time.Minute)
```
### 3.2. Quản lý Migration & Rollback (Tuân thủ .agent/rules/migration-and-rollback.md)
- Sử dụng migration embedded trong `internal/database/migrations/`; runtime hiện chạy các file `.up.sql` theo thứ tự.
- Mọi migration mới phải có `.down.sql` tương ứng để rollback vận hành thủ công; runtime hiện chưa có migration version table hoặc rollback command.
- Khi cần rollback tự động/versioned: thay thế runner hiện tại bằng migration library có tracking version trước khi triển khai production.
- **Nguyên tắc bắt buộc**: Mỗi migration file `.up.sql` luôn đi kèm file `.down.sql` có khả năng rollback hoàn toàn.
- **Mã hóa dữ liệu nhạy cảm at-rest**: Các cột credential (`ad_configs.bind_password`, `notification_configs.wxpusher_app_token`, `notification_configs.lan_webhook_url`) phải được mã hóa bằng thuật toán `AES-256-GCM` trước khi lưu vào PostgreSQL, sử dụng master key đọc từ biến môi trường `APP_ENCRYPTION_KEY` (32 bytes base64). Tuyệt đối không lưu plaintext credential trong database.
### 3.3. Chi tiết Schema DDL
```sql
-- Bảng danh mục vị trí chuẩn hóa (Master Data - Chống phân mảnh dữ liệu)
CREATE TABLE IF NOT EXISTS locations (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,        -- 'LINE_A1', 'LINE_A2', 'WAREHOUSE_RAW' (case-insensitive via unique index LOWER(code) hoặc citext)
    name_vi VARCHAR(255) NOT NULL,           -- 'Chuyền May A1'
    name_zh VARCHAR(255) NOT NULL,           -- '缝纫 A1 线'
    name_en VARCHAR(255) NOT NULL,           -- 'Sewing Line A1'
    qr_code VARCHAR(100) UNIQUE NOT NULL,    -- Dữ liệu QR quét từ máy/cột: 'LOC:LINE_A1'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_code_lower ON locations (LOWER(code));

-- Bảng người dùng với RBAC 4 cấp
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),               -- Băm bằng Argon2id (NULL nếu user thuần AD/LDAP không dùng local password)
    auth_source VARCHAR(20) NOT NULL DEFAULT 'LOCAL' CHECK (auth_source IN ('LOCAL','AD')),
    ad_dn VARCHAR(500) UNIQUE,                -- Distinguished Name từ AD: 'CN=Nguyen Van A,OU=Users,DC=factory,DC=lan'
    pin_hash VARCHAR(255),                    -- Băm Argon2id mã PIN (tùy chọn)
    badge_code VARCHAR(100) UNIQUE,           -- Mã thẻ QR nhân viên quét đăng nhập 1 chạm
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),                       -- Đồng bộ từ mail attribute của AD
    role VARCHAR(30) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','LINE_LEADER','SAFETY_OFFICER','ADMIN')),
    assigned_location_code VARCHAR(50) REFERENCES locations(code), -- Khu vực quản lý chính (cho LINE_LEADER)
    wx_uid VARCHAR(100),                      -- UID nhận tin WxPusher
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

-- Bảng quản lý Refresh Token & Thu hồi quyền (Revocation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    device_info VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng tags đa ngôn ngữ (Chuẩn hóa code, hỗ trợ vi/zh/en)
CREATE TABLE IF NOT EXISTS tags (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,        -- Mã định danh: 'oil_leak', 'blocked_aisle'
    name_vi VARCHAR(255) NOT NULL,           -- 'Rò rỉ dầu'
    name_zh VARCHAR(255) NOT NULL,           -- '漏油'
    name_en VARCHAR(255) NOT NULL,           -- 'Oil leak'
    category VARCHAR(10) NOT NULL CHECK (category IN ('1S','2S','3S','4S','5S','6S')), -- Gắn với chữ S
    use_count INT NOT NULL DEFAULT 1,
    is_preset BOOLEAN NOT NULL DEFAULT FALSE -- TRUE: Admin tạo sẵn, FALSE: User tạo
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_code_lower ON tags (LOWER(code));

-- Bảng issue 6S
CREATE TABLE IF NOT EXISTS issues (
    id BIGSERIAL PRIMARY KEY,
    client_uuid UUID UNIQUE NOT NULL,        -- UUID v4 sinh tại client chống duplicate khi sync
    version INT NOT NULL DEFAULT 1,          -- Optimistic locking chống xung đột sync offline
    creator_id BIGINT NOT NULL REFERENCES users(id),
    resolver_id BIGINT REFERENCES users(id), -- Người upload ảnh khắc phục
    category VARCHAR(10) NOT NULL CHECK (category IN ('1S','2S','3S','4S','5S','6S')),
    location_code VARCHAR(50) NOT NULL REFERENCES locations(code), -- Chuẩn hóa theo Master Data
    description TEXT,
    reject_reason TEXT,                      -- Lý do từ chối duyệt (khi REOPEN) hoặc lý do bác bỏ (khi INVALID)
    photo_before VARCHAR(255) NOT NULL,      -- CHỈ basename '{uuid}_wide.{ext}' — không lưu path (đổi -data-dir không hỏng record)
    photo_detail VARCHAR(255),               -- CHỈ basename '{uuid}_detail.{ext}'
    photo_after VARCHAR(255),                -- CHỈ basename '{uuid}.{ext}'
    score_rating SMALLINT DEFAULT 3 CHECK (score_rating BETWEEN 1 AND 5), -- Đánh giá chất lượng khắc phục (1-5 sao khi đóng)
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PENDING_REVIEW','CLOSED','INVALID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,                 -- Thời điểm upload photo_after
    closed_at TIMESTAMPTZ                    -- Thời điểm duyệt đóng issue
);

-- Bảng liên kết tags (Normalized Junction Table - Tối ưu truy vấn lọc tags, tránh LIKE scan)
CREATE TABLE IF NOT EXISTS issue_tags (
    issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    tag_code VARCHAR(50) NOT NULL REFERENCES tags(code) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, tag_code)
);

-- Bảng Transactional Outbox (Đảm bảo Zero-Loss thông báo khẩn cấp khi crash/offline)
CREATE TABLE IF NOT EXISTS notification_outbox (
    id BIGSERIAL PRIMARY KEY,
    issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,         -- 'NEW_ISSUE' | 'SAFETY_ESCALATED' | 'REOPENED'
    channel VARCHAR(50) NOT NULL,            -- 'WXPUSHER' | 'LAN_WEBHOOK'
    payload JSONB NOT NULL,                  -- JSON payload nội dung gửi (JSONB chuẩn Postgres)
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED')), -- 'SENDING' = đã claim, lease tính qua next_retry_at
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ
);

-- Bảng lưu lịch sử tác vụ định kỳ chống lỡ job (Cron Job State)
CREATE TABLE IF NOT EXISTS cron_task_logs (
    id BIGSERIAL PRIMARY KEY,
    task_name VARCHAR(100) NOT NULL,         -- 'OVERDUE_PENALTY_SCAN' | 'DB_BACKUP' | 'CLEANUP_ORPHANS' | 'CLEANUP_AUDIT_LOGS'
    last_run_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL,             -- 'SUCCESS' | 'FAILED'
    details TEXT
);

-- Bảng cấu hình quy tắc chấm điểm (Admin tùy chỉnh)
CREATE TABLE IF NOT EXISTS scoring_rules (
    id BIGSERIAL PRIMARY KEY,
    rule_key VARCHAR(100) UNIQUE NOT NULL,   -- 'base_weekly_score', 'penalty_normal', 'penalty_safety', 'penalty_overdue', 'bonus_kaizen', 'reward_reporter_normal', 'reward_reporter_safety', 'penalty_reporter_invalid', 'penalty_reopen'
    points INT NOT NULL,                     -- Điểm (số âm = phạt, số dương = thưởng)
    description TEXT                         -- Chú thích hiển thị trên giao diện cấu hình
);

-- Sổ cái lưu vết điểm số bất biến (Score Ledger)
CREATE TABLE IF NOT EXISTS score_logs (
    id BIGSERIAL PRIMARY KEY,
    issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL,        -- 'LOCATION' (Chuyền/Khu vực) | 'USER' (Cá nhân)
    target_id VARCHAR(100) NOT NULL,         -- location_code hoặc user_id
    rule_key VARCHAR(100) NOT NULL,          -- Mã quy tắc áp dụng
    points INT NOT NULL,                     -- Số điểm thực tế tại thời điểm phát sinh (Snapshot)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    penalty_date DATE                        -- YYYY-MM-DD (cho OVERDUE_PENALTY_SCAN chống phạt trùng khi chạy bù)
);

-- Lịch sử kiểm toán hệ thống toàn diện (Enterprise System Audit Trail)
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,            -- 'LOGIN_FAILED' | 'ROLE_CHANGED' | 'USER_LOCKED' | 'ISSUE_INVALIDATED'
    target_table VARCHAR(100) NOT NULL,
    target_id VARCHAR(100) NOT NULL,
    old_value JSONB,                         -- JSONB snapshot dữ liệu trước thay đổi
    new_value JSONB,                         -- JSONB snapshot dữ liệu sau thay đổi
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng cấu hình kết nối Active Directory / LDAP (Admin quản lý động qua UI/API)
CREATE TABLE IF NOT EXISTS ad_configs (
    id INT PRIMARY KEY CHECK (id = 1),       -- Singleton pattern (duy nhất 1 record id=1)
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    server VARCHAR(255) NOT NULL DEFAULT '', -- FQDN hoặc IP: 'ad.factory.lan'
    port INT NOT NULL DEFAULT 636,           -- 636 (LDAPS) hoặc 389 (StartTLS)
    use_tls BOOLEAN NOT NULL DEFAULT TRUE,
    skip_tls_verify BOOLEAN NOT NULL DEFAULT FALSE,
    base_dn VARCHAR(500) NOT NULL DEFAULT '', -- 'DC=factory,DC=lan'
    bind_dn VARCHAR(500) NOT NULL DEFAULT '', -- 'CN=svc_6s_auth,OU=Services,DC=factory,DC=lan'
    bind_password VARCHAR(500) NOT NULL DEFAULT '', -- Mật khẩu bind đã mã hóa AES-256-GCM (nonce + ciphertext base64)
    user_filter VARCHAR(500) NOT NULL DEFAULT '(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=%s)(userPrincipalName=%s)))',
    group_admin_dn VARCHAR(500) NOT NULL DEFAULT '',
    group_safety_dn VARCHAR(500) NOT NULL DEFAULT '',
    group_leader_dn VARCHAR(500) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by BIGINT REFERENCES users(id)
);

-- Bảng cấu hình kênh thông báo (Admin quản lý động qua UI/API - Singleton id=1)
CREATE TABLE IF NOT EXISTS notification_configs (
    id INT PRIMARY KEY CHECK (id = 1),
    wxpusher_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    wxpusher_app_token VARCHAR(500) NOT NULL DEFAULT '', -- AES-256-GCM (nonce + ciphertext base64)
    lan_webhook_url VARCHAR(500) NOT NULL DEFAULT '',    -- AES-256-GCM (URL chứa secret token của group)
    public_base_url VARCHAR(255) NOT NULL DEFAULT 'https://6s.factory.lan', -- Ghép link chi tiết issue trong payload
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by BIGINT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_client_uuid ON issues(client_uuid);
CREATE INDEX IF NOT EXISTS idx_issues_location_code ON issues(location_code);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_composite ON issues(location_code, status, category);
CREATE INDEX IF NOT EXISTS idx_issue_tags_tag ON issue_tags(tag_code);
CREATE INDEX IF NOT EXISTS idx_tags_use_count ON tags(use_count DESC);
CREATE INDEX IF NOT EXISTS idx_score_logs_target ON score_logs(target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_score_logs_rule ON score_logs(rule_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_score_logs_overdue ON score_logs(issue_id, rule_key, penalty_date) WHERE penalty_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON notification_outbox(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_system_audit_target ON system_audit_logs(target_table, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id); -- Admin revoke theo user_id không scan full table
```

### 3.4. Kế hoạch Rollback (Down Migration DDL mẫu - `000001_init_schema.down.sql`)
```sql
DROP TABLE IF EXISTS ad_configs;
DROP TABLE IF EXISTS notification_configs;
DROP TABLE IF EXISTS system_audit_logs;
DROP TABLE IF EXISTS score_logs;
DROP TABLE IF EXISTS scoring_rules;
DROP TABLE IF EXISTS cron_task_logs;
DROP TABLE IF EXISTS notification_outbox;
DROP TABLE IF EXISTS issue_tags;
DROP TABLE IF EXISTS issues;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS locations;
```

## 4. QUY TẮC NGHIỆP VỤ 6S & QUẢN LÝ TRỰC QUAN (VISUAL MANAGEMENT)

### 4.1. Định nghĩa 6S & Hành động trọng tâm
- **1S (Sàng lọc - Seiri)**: Loại bỏ vật dụng thừa, phế phẩm, đồ hỏng chiếm lối đi/mặt sàn.
- **2S (Sắp xếp - Seiton)**: Đặt đúng vị trí, thiếu vạch kẻ layout, thiếu biển tên/nhãn mác nhận diện.
- **3S (Sạch sẽ - Seiso)**: Rò rỉ dầu mỡ, bụi bám thiết bị, rác thải trên sàn thao tác.
- **4S (Săn sóc - Seiketsu)**: Không duy trì vệ sinh định kỳ, tài liệu quy chuẩn/bảng tin bị rách/hỏng.
- **5S (Sẵn sàng - Shitsuke)**: Không tuân thủ nội quy, tác phong bảo hộ, thiếu ý thức tự giác.
- **6S (An toàn - Safety)**: **Mức ưu tiên tuyệt đối**. Che chắn công tắc khẩn cấp, chặn lối thoát hiểm, dây điện trần, nguy cơ cháy nổ.

### 4.2. Quy tắc ưu tiên & Cảnh báo tồn đọng (Aging SLA)
- **Ưu tiên 6S (Safety First)**: Tất cả issue phân loại là `6S` tự động gắn cờ đỏ cảnh báo `NGUY HIỂM` và ghim lên vị trí ưu tiên cao nhất trong danh sách.
- **SLA xử lý theo thời gian**:
  - `< 24h`: Trạng thái bình thường.
  - `24h - 48h`: Huy hiệu cảnh báo màu cam `Tồn đọng > 24h`.
  - `> 48h`: Viền đỏ nổi bật `QUÁ HẠN` và tự động đẩy lên đầu danh sách chờ xử lý.

### 4.3. Thẻ Kaizen Trực quan (Before / After Comparison)
- Bắt buộc đối chiếu 2 ảnh Before - After trực tiếp trên cùng một màn hình (Split-view hoặc thanh trượt kéo so sánh).
- Người duyệt/kiểm tra đánh giá nhanh trong 2 giây xem hành động khắc phục đã triệt để hay chỉ mang tính đối phó.

### 4.4. Điểm nóng 6S (Top Hotspots)
Màn hình chính hiển thị 3 chỉ số nhanh giúp cấp quản lý nhận diện ngay nút thắt:
1. **Tồn đọng**: Tổng số issue `OPEN` + số lượng đã quá 48h.
2. **Điểm nóng khu vực**: Vị trí phát sinh nhiều lỗi nhất trong tuần (ví dụ: `Chuyền May A2 (8 lỗi)`).
3. **Lỗi phổ biến nhất**: Phân loại S bị vi phạm nhiều nhất (ví dụ: `3S - Sạch sẽ chiếm 60%`).

### 4.5. Cơ chế phòng ngừa & Sửa sai phân loại (Misclassification Handling)
- **Phòng ngừa tại form tạo issue (Micro-hints & Tag lọc theo S)**:
  - Nút chọn 1S - 6S có nhãn phụ gợi ý hành động 2-3 từ:
    - `1S`: Đồ thừa / Phế phẩm
    - `2S`: Sai chỗ / Thiếu vạch
    - `3S`: Bẩn / Rò rỉ dầu
    - `4S`: Hỏng chuẩn / Bảng tin
    - `5S`: Sai tác phong / Nội quy
    - `6S`: Nguy hiểm / Cháy nổ (Viền đỏ cảnh báo)
  - **Lọc tag theo ngữ cảnh (Cascade Tag Filtering)**: Khi người dùng bấm chọn loại S nào (ví dụ `3S`), danh sách tag ưu tiên gợi ý các tag liên quan đến chữ S đó (`#rò_dầu`, `#bụi_máy`, `#sàn_trơn`).
- **Sửa sai trực tiếp (In-place Quick Edit)**:
  - Cho phép Creator, Resolver hoặc Admin bấm trực tiếp vào badge `category` hoặc `tags` tại màn hình chi tiết để chỉnh sửa mà không cần làm thủ tục xin duyệt hủy.
  - **Ngoại lệ an toàn (Safety Escalation)**: Nếu issue được đổi từ bất kỳ loại S nào sang `6S (Safety)`, hệ thống tự động ghim lên đầu hàng đợi và bắn 1 tin cảnh báo khẩn cấp bổ sung lên nhóm WeChat.

### 4.6. Chấm điểm sức khỏe 6S & Điểm cá nhân Thợ săn 6S (Leaderboards)
- **A. Điểm sức khỏe Chuyền/Khu vực (Tập thể - Health Score)**:
  - Tự động tính toán theo thời gian thực (Zero-input), mỗi khu vực khởi đầu tuần với 100 điểm gốc (`base_weekly_score`).
  - Trừ điểm lỗi thường (`OPEN` từ 1S - 5S): theo `penalty_normal` (mặc định `-2`).
  - Trừ điểm lỗi an toàn (`OPEN` là 6S): theo `penalty_safety` (mặc định `-10`).
  - Trừ điểm tồn đọng quá hạn (`OPEN` > 48h): theo `penalty_overdue` (mặc định `-5/ngày`). Backend Go chạy goroutine ticker mỗi 00:00 hàng ngày (theo giờ địa phương nhà máy), quét toàn bộ issue `OPEN` quá 48h và insert tự động 1 bản ghi phạt vào `score_logs` kèm `penalty_date = 'YYYY-MM-DD'`. Nhờ ràng buộc `uq_score_logs_overdue`, tác vụ quét bù hoàn toàn idempotent, không sợ phạt trùng lặp.
  - Phạt khắc phục đối phó bị Reopen: theo `penalty_reopen` (mặc định `-2`).
  - Thưởng điểm Kaizen xuất sắc khi đóng issue (`score_rating = 5` sao): theo `bonus_kaizen` (mặc định `+5`).
  - **Điều kiện nhận điểm**: Issue bắt buộc phải qua bước duyệt đạt (`CLOSED`). Báo lỗi lúc `OPEN` chưa được cộng điểm để ngăn chặn spam.
  - Khi issue chuyển sang `CLOSED`:
    - Báo lỗi thường (1S - 5S) được duyệt: Creator nhận `+2 điểm` (`reward_reporter_normal`).
    - Báo lỗi an toàn nguy hiểm (6S) được duyệt: Creator nhận `+5 điểm` (`reward_reporter_safety`).
  - Khi issue bị đánh dấu `INVALID` (Báo sai / Ảnh rác / Trục lợi điểm):
    - Creator bị phạt `-5 điểm` (`penalty_reporter_invalid`).
- **B. Bảng xếp hạng trên UI**:
  - Tab 1: "Sức khỏe Khu vực" (Xếp từ thấp đến cao để giải quyết điểm nóng).
  - Tab 2: "Top Thợ săn 6S" (Vinh danh cá nhân phát hiện nhiều vấn đề chuẩn xác nhất).
- **C. Sổ cái bất biến (Score Ledger) & Cơ chế Hồi tố điểm (Phase 2 - Scope Mở Rộng)**:
  - *Lưu ý YAGNI: Phase 1 tập trung tính điểm tuần theo thời gian thực (snapshot lúc phát sinh). Tính năng Hồi tố (Retroactive Recalculation) thuộc Phase 2.*
  - Mọi biến động điểm được ghi nhận vào `score_logs` theo snapshot giá trị quy tắc tại thời điểm phát sinh.
  - Khi thay đổi cấu hình điểm: Mặc định chỉ áp dụng cho tương lai, không ảnh hưởng dữ liệu lịch sử tuần/tháng trước.
  - Hồi tố theo chỉ đạo (`apply_from`): KHÔNG `UPDATE` ngược vào entry đã phát hành (giữ đúng tính bất biến của sổ cái). Hệ thống quét `score_logs` từ `apply_from`, tính chênh lệch điểm cũ so với quy tắc mới, rồi chèn **entry điều chỉnh delta** (`rule_key = 'retro_adjust'`, points = delta, target giữ nguyên) kèm ghi vết `system_audit_logs` (`target_table = 'scoring_rules'`). Tổng điểm = `SUM(points)` tự hấp thụ delta, không cần công thức ngoại lệ.

## 5. VÒNG ĐỜI VÀ MA TRẬN PHÂN QUYỀN ISSUE

### 5.1. Vòng đời trạng thái
1. `OPEN`: Issue mới tạo, chờ xử lý.
2. `PENDING_REVIEW`: Đã có người upload `photo_after`.
3. `CLOSED`: Creator hoặc Admin xác nhận khắc phục đạt yêu cầu -> Kích hoạt cộng điểm cá nhân cho Creator.
4. `OPEN` (Reopen): Creator hoặc Admin từ chối khắc phục, yêu cầu làm lại.
5. `INVALID`: Admin bác bỏ issue (báo sai, spam) -> Trừ điểm phạt Creator.

### 5.2. Ma trận quyền theo vai trò (Enterprise RBAC Matrix)

| Hành động | USER (Công nhân) | LINE_LEADER (Trưởng chuyền) | SAFETY_OFFICER (An toàn) | ADMIN (Quản trị) |
|---|:---:|:---:|:---:|:---:|
| Tạo issue (Offline/Online) | Cho phép | Cho phép | Cho phép | Cho phép |
| Xem danh sách / chi tiết | Toàn bộ | Toàn bộ | Toàn bộ | Toàn bộ |
| Upload ảnh sau sửa (`photo_after`) | Cho phép | Cho phép | Cho phép | Cho phép |
| Đóng issue thường (1S-5S) | Creator chỉ đóng issue của mình | Duyệt issue thuộc chuyền mình hoặc Creator | Duyệt toàn bộ | Duyệt toàn bộ |
| Đóng issue an toàn (6S) | Chặn (403) | Chặn (403) | **Duyệt toàn bộ** | **Duyệt toàn bộ** |
| Mở lại issue (`REOPEN`) | Creator | Line Leader chuyền hoặc Creator | Toàn bộ | Toàn bộ |
| Bác bỏ issue (`INVALID`) | Chặn (403) | Chặn (403) | Cho phép | Cho phép |
| Cấu hình điểm & Hồi tố | Chặn (403) | Chặn (403) | Chặn (403) | **Toàn quyền** |
| Cấu hình Active Directory / LDAP | Chặn (403) | Chặn (403) | Chặn (403) | **Toàn quyền** |
| Quản lý permission matrix | Chặn (403) | Chặn (403) | Chặn (403) | Theo permission `permission:manage` |
| Xem audit/score logs | Theo quyền | Theo quyền | Theo quyền | Theo quyền |

## 5.3. CHUẨN HÓA KỸ THUẬT & PHẢN HỒI API (TECHNICAL CONTRACTS)

### A. Khóa cứng Công nghệ (Strict Tech Stack)
- **Backend**: Go 1.23+.
  - HTTP Router: `github.com/go-chi/chi/v5` (nhẹ, chuẩn `net/http`, không boilerplate).
  - Database: `database/sql` + `github.com/jackc/pgx/v5/stdlib`; pool cấu hình qua `database/sql`.
  - Auth: `github.com/golang-jwt/jwt/v5`, `golang.org/x/crypto/argon2`.
  - LDAP: `github.com/go-ldap/ldap/v3`.
  - AI: `github.com/openai/openai-go` với provider OpenAI-compatible.
- **Frontend**:
  - Runtime/build: React 18+ (TypeScript), Vite 5+.
  - Styling: Tailwind CSS v4.3+ (CSS-first, engine Oxide, `@tailwindcss/vite`; không UI library cồng kềnh).
  - State: `zustand`; offline storage: `idb`/IndexedDB.
  - Routing: `wouter`.
  - Charts: `recharts`.
  - Icons: `lucide-react`.
  - Quality: Biome + TypeScript; unit tests bằng Bun; E2E bằng Playwright.

### B. Cấu trúc Thư mục Dự án Bắt buộc (Prescribed Directory Layout)
```text
6s/
├── cmd/server/main.go
├── internal/
│   ├── config/                  # Env & runtime configuration
│   ├── auth/                    # Argon2id, JWT, AD/LDAP, RBAC, permission matrix, sessions
│   ├── issue/                   # CRUD, uploads, state transitions, SSE events
│   ├── scoring/                 # Scores, leaderboard, retroactive adjustments
│   ├── report/                  # Summary and CSV export
│   ├── notification/            # Transactional outbox and HTTP senders
│   ├── ai/                      # Translation, cache, review, provider config
│   ├── cron/                    # Scheduled jobs and task ledger
│   ├── storage/                 # Safe upload serving and file management
│   ├── crypto/                  # AES-256-GCM credential encryption
│   ├── i18n/                    # vi/en/zh error localization
│   ├── apperror/                # Typed application errors
│   └── response/                # JSON envelope helpers
├── web/                         # React PWA
│   ├── src/{api,components,db,hooks,i18n,pages,store,sync,types,utils}/
│   ├── public/{manifest.webmanifest,sw.js}
│   └── index.html
├── data/                        # Uploads and backups
├── openapi.yaml
├── sql/schema.sql
└── go.mod
```

### C. Định dạng Phong bì Dữ liệu Bắt buộc (Mandatory API Envelope)
Tất cả endpoint HTTP trả về JSON đều dùng chung 1 cấu trúc duy nhất:

1. **Phản hồi Thành công (`HTTP 200/201`)**:
```json
{
  "data": { ... } // hoặc mảng [ ... ]
}
```

2. **Phản hồi Danh sách Phân trang (`HTTP 200`)**:
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142
  }
}
```

3. **Phục vụ Static Assets (Uploads)**:
- Endpoint: `GET /uploads/*`
- Header: `Cache-Control: public, max-age=31536000, immutable` (do file lưu kèm UUID v4 bất biến).
- Bảo mật: Chặn path traversal, chỉ serve từ thư mục upload hợp lệ (`./data/uploads` hoặc `./uploads`).
- **Contract định dạng ảnh giữa DB và API**: Cột DB (`photo_before`, `photo_detail`, `photo_after`) CHỈ lưu basename file (`{uuid}_wide.jpg`, `{uuid}_detail.jpg`, `{uuid}.jpg`). Layer API khi serialize response sẽ tự động nối tiền tố URL tĩnh (ví dụ: `/uploads/before/{basename}` hoặc `/uploads/after/{basename}`) trước khi trả về cho client.
4. **Phản hồi Lỗi (`HTTP 4xx/5xx`)**:
```json
{
  "error": {
    "code": "ISSUE_CONFLICT",
    "message": "Phiên bản issue đã bị thay đổi bởi người dùng khác",
    "details": {
      "current_status": "PENDING_REVIEW",
      "current_version": 2
    }
  }
}
```

### D. Thuật toán Tính Điểm Sức Khỏe Khu Vực (Deterministic Formula)
- **Khung thời gian tuần**: Bắt đầu lúc `00:00:00 Thứ Hai` theo múi giờ địa phương của nhà máy (ISO-8601 offset, vd: `+07:00`) đến hiện tại.
- **Nguyên tắc tính điểm**: 
  - Mọi biến động điểm (trừ điểm khi tạo issue OPEN, phạt tồn đọng hàng ngày qua `OVERDUE_PENALTY_SCAN`, phạt reopen, thưởng kaizen, v.v.) đều được ghi nhận trực tiếp vào sổ cái `score_logs`.
  - Tránh phạt trùng lặp (Double Penalty): Điểm tuần được tính hoàn toàn thông qua việc tổng hợp `score_logs` trong tuần hiện tại, không cộng dồn thêm công thức ước tính riêng biệt bên ngoài.
- **Công thức tính điểm khu vực tại thời điểm T**:
  Backend Go tính mốc `start_of_week` (Thứ Hai 00:00:00 local time) và thực hiện query:
  $$\text{HealthScore} = \text{base\_weekly\_score} + \sum \text{points\_in\_week}$$
  Trong đó $\sum \text{points\_in\_week}$ là tổng cột `points` trong `score_logs` của khu vực có `created_at >= start_of_week`.
- **Quy ước `target_type`**: `penalty_normal`, `penalty_safety`, `penalty_overdue`, `penalty_reopen`, `bonus_kaizen` ghi `target_type='LOCATION'` (tính vào HealthScore khu vực); `reward_reporter_normal`, `reward_reporter_safety`, `penalty_reporter_invalid` ghi `target_type='USER'`. Công thức HealthScore CHỈ tổng hợp bản ghi `target_type='LOCATION'`; Leaderboard cá nhân CHỈ tổng hợp `target_type='USER'`. Hai bảng điểm không lẫn dữ liệu của nhau.
- Giới hạn: Điểm không vượt quá 120 (khi có nhiều bonus) và không thấp hơn 0 điểm:
  $$\text{FinalScore} = \max(0, \min(120, \text{HealthScore}))$$

### E. Chuẩn Payload Cho Kênh Thông Báo Outbox (Standard Outbox Payloads)
Cấu trúc JSON lưu trong cột `notification_outbox.payload`. Các giá trị `appToken`, `uids`, `url` được Worker ghép ĐỘNG từ bảng `notification_configs` (`wxpusher_app_token`, `public_base_url`) tại thời điểm gửi — ví dụ dưới đây chỉ minh họa cấu trúc, không hardcode token vào code/binary:

1. **Kênh `WXPUSHER`**:
```json
{
  "appToken": "AT_xxxxxxxxxxxxxx",
  "uids": ["UID_xxxxxxxxxxxxxx"],
  "topicIds": [12345],
  "content": "### ⚠️ CẢNH BÁO 6S: [6S - Nguy cơ cháy nổ]\n- **Vị trí**: Chuyền May A1\n- **Người báo**: Nguyễn Văn A\n- **Ảnh**: [Xem chi tiết](https://6s.factory.lan/issues/123)",
  "contentType": 3,
  "url": "https://6s.factory.lan/issues/123"
}
```

2. **Kênh `LAN_WEBHOOK` (Chuẩn phổ quát tương thích DingTalk / Lark / Mattermost)**:
```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "Cảnh báo 6S: Chuyền May A1",
    "text": "## ⚠️ Cảnh báo 6S: LINE_A1\n> Phân loại: 6S (Safety)\n> Chi tiết: Che chắn nút khẩn cấp\n> Link xử lý: https://6s.factory.lan/issues/123"
  }
}
```

---

## 6. API SPECIFICATION
Format dữ liệu: `application/json` hoặc `multipart/form-data`.
Authentication: Header `Authorization: Bearer <ACCESS_TOKEN>`.
Mọi phản hồi JSON tuân thủ chuẩn phong bì tại Mục 5.3.

### 6.1. Authentication & Token Lifecycle
- `POST /api/auth/login` (Hỗ trợ Local & Active Directory / LDAP)
  - Rate Limit: Tối đa 5 lần thử sai / 1 phút / IP, vượt ngưỡng trả HTTP 429. Khi chạy sau reverse proxy, backend CHỈ tin `X-Forwarded-For` từ danh sách proxy cấu hình trước (env `TRUSTED_PROXIES`) — không trust header từ client trực tiếp.
  - Khóa theo tài khoản: 10 lần sai liên tiếp trong 15 phút cho cùng `username`/`badge_code` -> tạm khóa 15 phút (bộ đếm in-memory theo tài khoản, reset khi đăng nhập thành công), ghi `system_audit_logs` (`action = 'LOGIN_LOCKED'`) để Admin biết công nhân nào bị khóa.
  - **Chuẩn JWT Token (.agent/rules/access-control.md)**:
    - Runtime hiện có default `JWT_SECRET` cho môi trường dev; production MUST override bằng environment/CLI. Đây là khoản cần harden: production phải fail fast khi thiếu secret hợp lệ, tuyệt đối không dùng default secret.
    - Payload chỉ chứa claims tối giản: `sub` (user_id dạng int/string), `exp`, `iat`. Tuyệt đối không nhúng PII, tên, hay danh sách roles vào JWT payload.
    - Role và quyền được tra cứu trực tiếp theo `sub` từ PostgreSQL/cache tại middleware xác thực.
    - Thời hạn Access Token: tối đa `3600` giây (60 phút) cho mobile/web. Refresh Token: tối đa 30 ngày.
  - Luồng xác thực linh hoạt (Hybrid Auth Flow):
    1. Đọc cấu hình AD từ bảng `ad_configs` trong DB:
       - Nếu `is_enabled = 1`:
         - Backend kết nối tới AD Domain Controller theo cấu hình trong DB qua LDAPS (`port 636`) hoặc StartTLS (`port 389`).
         - Sử dụng service bind (`bind_dn` / `bind_password` sau khi giải mã AES-256-GCM) để tìm kiếm người dùng theo `user_filter`, sau đó bind auth bằng mật khẩu người dùng cung cấp.
         - **Xác thực thành công**:
           - Nếu user chưa tồn tại trong PostgreSQL: Tự động khởi tạo (JIT - Just-In-Time Provisioning) với `auth_source = 'AD'`, map `displayName` -> `full_name`, `mail` -> `email`. Gán role theo nhóm AD (`group_admin_dn`, `group_safety_dn`, `group_leader_dn`, mặc định `USER`).
           - Nếu user đã tồn tại: Cập nhật `last_login_at`, cập nhật lại `role` nếu có thay đổi group mapping.
           - Cấp Access Token (1h) + Refresh Token (30 ngày).
        - **Xác thực thất bại** — phân biệt 2 nhóm lỗi, không gộp chung:
          - `LDAP Result Code 49 (Invalid Credentials)`: sai mật khẩu/DN thật -> trả 401, KHÔNG fallback local (chống attacker dùng mật khẩu AD sai rồi lọt qua mật khẩu local cũ chưa đổi).
          - Lỗi kết nối (timeout, DNS, TLS handshake, AD down): cho phép fallback tài khoản `auth_source='LOCAL'` còn `is_active` bằng Argon2id — kênh cứu hộ khẩn cấp cho Admin local. Ghi `system_audit_logs` (`action='AD_UNREACHABLE_FALLBACK'`).
       - Nếu `is_enabled = 0`: So khớp hoàn toàn bằng Argon2id trong PostgreSQL (tài khoản nội bộ).
  - Trả về (HTTP 200 - Envelope):
    ```json
    {
      "data": {
        "access_token": "...",
        "expires_in": 3600,
        "refresh_token": "...",
        "refresh_expires_in": 2592000,
        "user": {
          "id": 1,
          "username": "...",
          "auth_source": "AD",
          "role": "LINE_LEADER",
          "assigned_location_code": "LINE_A2",
          "full_name": "..."
        }
      }
    }
    ```
- `POST /api/auth/refresh`
  - Body: `{"refresh_token": "..."}`
  - Xử lý: Tra cứu `refresh_tokens`. Nếu hợp lệ và chưa bị thu hồi (`revoked_at IS NULL`), cấp mới cặp `access_token` và `refresh_token` (Token Rotation chống tái sử dụng).
  - Trả về (HTTP 200 - Envelope):
    ```json
    {
      "data": {
        "access_token": "...",
        "expires_in": 3600,
        "refresh_token": "...",
        "refresh_expires_in": 2592000
      }
    }
    ```
- `POST /api/auth/revoke` (Đăng xuất hoặc thu hồi thiết bị mất)
  - Header: Role Admin hoặc chính chủ Token
  - Body: `{"refresh_token_id": 123}` hoặc `{"user_id": 5}` (Admin cưỡng chế thu hồi toàn bộ phiên đăng nhập của nhân viên nghỉ việc/mất máy).
  - Ghi vết `system_audit_logs`.
  - Trả về (HTTP 200 - Envelope): `{"data": {"revoked": true}}`.

- `GET /api/auth/sessions` (Liệt kê phiên hoạt động của chính user; kèm `?user_id=` khi Admin — phục vụ màn "Thu hồi thiết bị mất", vì `/revoke` cần `refresh_token_id` mà client không thể biết nếu không có endpoint này)
  - Trả về (HTTP 200 - Envelope): `{"data": [{"id": 123, "device_info": "...", "created_at": "...", "expires_at": "..."}]}`

### 6.2. Master Data: Locations & Tags
- `GET /api/locations`
  - Trả về danh sách master data vị trí (HTTP 200 - Envelope):
    ```json
    {
      "data": [
        {"code": "LINE_A1", "name_vi": "Chuyền May A1", "name_zh": "缝纫 A1 线", "name_en": "Sewing Line A1", "qr_code": "LOC:LINE_A1"},
        {"code": "LINE_A2", "name_vi": "Chuyền May A2", "name_zh": "缝纫 A2 线", "name_en": "Sewing Line A2", "qr_code": "LOC:LINE_A2"}
      ]
    }
    ```
  - Client PWA cache vào IndexedDB phục vụ dropdown và quét QR offline.
- `POST /api/locations` (Admin quản lý danh mục xưởng/chuyền)
  - Header: Role Admin
  - Body: `{"code": "LINE_A3", "name_vi": "Chuyền May A3", "name_zh": "缝纫 A3 线", "name_en": "Sewing Line A3", "qr_code": "LOC:LINE_A3"}`
  - Trả về (HTTP 201 - Envelope): `{"data": {"code": "LINE_A3", ...}}`.
- `GET /api/tags`
  - Trả về danh sách tag sắp xếp theo tần suất (HTTP 200 - Envelope):
    ```json
    {
      "data": [
        {"code": "oil_leak", "name_vi": "Rò rỉ dầu", "name_zh": "漏油", "name_en": "Oil leak", "category": "3S", "use_count": 45},
        {"code": "blocked_aisle", "name_vi": "Chắn lối đi", "name_zh": "堵塞通道", "name_en": "Blocked aisle", "category": "2S", "use_count": 32}
      ]
    }
    ```
  - Client cache danh sách này vào IndexedDB (đồng bộ chính sách với Locations và Cache Warming tại Mục 9.9B — không dùng LocalStorage cho master data).
- `POST /api/tags` (Dành cho Admin tạo hoặc bổ sung bản dịch)
  - Header: Role Admin
  - Body: `{"code": "fire_hazard", "name_vi": "Nguy cơ cháy", "name_zh": "火灾隐患", "name_en": "Fire hazard", "category": "6S"}`
  - Xử lý: Insert hoặc update bản dịch vào bảng `tags`.
  - Trả về (HTTP 200/201 - Envelope): `{"data": {"code": "fire_hazard", ...}}`.

### 6.3. Issues
- `GET /api/issues`
  - Query: `?status=OPEN&category=1S&location_code=LINE_A1&page=1&limit=20`
  - Trả về (HTTP 200 - Pagination Envelope):
    ```json
    {
      "data": [
        {
          "id": 1,
          "client_uuid": "c0a80101-0000-4000-8000-000000000001",
          "version": 1,
          "category": "3S",
          "location_code": "LINE_A1",
          "location_name": "Chuyền May A1",
          "tags": ["oil_leak"],
          "description": "Rò rỉ dầu dưới chân máy",
          "reject_reason": null,
          "photo_before": "/uploads/before/c0a80101-0000-4000-8000-000000000001_wide.jpg",
          "photo_detail": null,
          "photo_after": null,
          "score_rating": 3,
          "status": "OPEN",
          "creator": {
            "id": 10,
            "username": "worker_01",
            "full_name": "Nguyễn Văn A"
          },
          "resolver": null,
          "created_at": "2026-09-04T08:00:00Z",
          "resolved_at": null,
          "closed_at": null
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1
      }
    }
    ```
- `GET /api/issues/{id}`
  - Trả về chi tiết 1 issue (HTTP 200 - Envelope):
    ```json
    {
      "data": {
        "id": 1,
        "client_uuid": "c0a80101-0000-4000-8000-000000000001",
        "version": 1,
        "category": "3S",
        "location_code": "LINE_A1",
        "location_name": "Chuyền May A1",
        "tags": ["oil_leak"],
        "description": "Rò rỉ dầu dưới chân máy",
        "reject_reason": null,
        "photo_before": "/uploads/before/c0a80101-0000-4000-8000-000000000001_wide.jpg",
        "photo_detail": null,
        "photo_after": null,
        "score_rating": 3,
        "status": "OPEN",
        "creator": {
          "id": 10,
          "username": "worker_01",
          "full_name": "Nguyễn Văn A"
        },
        "resolver": null,
        "created_at": "2026-09-04T08:00:00Z",
        "resolved_at": null,
        "closed_at": null
      }
    }
    ```
- `POST /api/issues/sync` (Đồng bộ tạo mới từ client - Bảo mật Upload & Outbox)
  - Content-Type: `multipart/form-data`
  - Form fields:
    - `client_uuid` (string, bắt buộc, format UUID v4)
    - `category` (string, bắt buộc: '1S'..'6S')
    - `location_code` (string, bắt buộc, phải tồn tại trong bảng `locations`)
    - `tags` (string, JSON array các code, ví dụ: `'["oil_leak", "safety_gear"]'`)
    - `description` (string, tùy chọn)
    - `photo_before` (file ảnh toàn cảnh/bối cảnh, bắt buộc)
    - `photo_detail` (file ảnh cận cảnh/annotation, tùy chọn)
  - Kiểm tra an toàn File Upload (Server-side File Sanitization & Sniffing):
    - **Dung lượng**: Mỗi Photo ≤ 2MB. Vượt quá trả HTTP 413 Payload Too Large.
    - **Magic Bytes Verification**: Đọc 512 bytes đầu tiên. Ảnh bắt buộc là `image/jpeg` (`FF D8 FF`) hoặc `image/png` (`89 50 4E 47`). Mime-type không khớp -> từ chối với HTTP 415 Unsupported Media Type.
    - **Đặt tên file tuyệt đối an toàn (Chống Path Traversal)**: Backend bắt buộc kiểm tra và parse UUID qua thư viện chuẩn (`uuid.Parse(client_uuid)`). Nếu không hợp lệ trả về HTTP 400 Bad Request ngay; tuyệt đối không ghép chuỗi đường dẫn trực tiếp từ client payload. Xác định đuôi file `{ext}` dựa trên MIME type sau khi sniff (`image/jpeg` -> `.jpg`, `image/png` -> `.png`). File sau khi validate được lưu tại `./uploads/before/{valid_uuid}_wide.{ext}` và `./uploads/before/{valid_uuid}_detail.{ext}`. Cột DB tương ứng chỉ lưu **basename** (`{uuid}_wide.jpg`), base dir ghép từ cờ `-data-dir` lúc serve.
  - Kiểm tra `client_uuid` đã tồn tại chưa:
    - Nếu đã có: Trả về record hiện tại (idempotent, HTTP 200).
    - Nếu chưa:
      - Bắt đầu PostgreSQL Transaction:
        - Insert vào bảng `issues`.
        - Insert các tag liên kết vào bảng `issue_tags` và tăng `use_count` cho bảng `tags`.
        - Insert vào bảng `notification_outbox` với trạng thái `PENDING` (đảm bảo atomic, không bao giờ mất cảnh báo nếu server crash).
      - Commit Transaction. Kích hoạt signal non-blocking qua `notifyCh` đánh thức Outbox Worker xử lý tức thì (< 100ms). Trả về HTTP 201 Created.
- `POST /api/issues/{id}/resolve` (Khắc phục - Hỗ trợ cả trực tuyến & Offline Sync)
  - Content-Type: `multipart/form-data`
  - Form fields:
    - `photo_after` (file ảnh, bắt buộc, tối đa 2MB, validate magic bytes JPEG/PNG)
    - `resolved_client_uuid` (string, bắt buộc, UUID v4)
    - `expected_version` (integer, bắt buộc): Phiên bản issue tại thời điểm client bắt đầu chụp ảnh khắc phục.
  - Kiểm tra an toàn File: Parse `uuid.Parse(resolved_client_uuid)` để ngăn chặn path traversal. Xác định đuôi file `{ext}` từ MIME sniffing (`.jpg` hoặc `.png`). Lưu an toàn tại `./uploads/after/{valid_resolved_uuid}.{ext}`.
  - Kiểm tra trạng thái & Concurrency:
    - Nếu `status != 'OPEN'`:
      - Trả về HTTP 409 Conflict (Error Envelope): `{"error": {"code": "ISSUE_CONFLICT", "message": "Issue already resolved or closed", "details": {"current_status": status, "current_version": version}}}`.
      - Client nhận 409 sẽ chuyển item sang tab "Xung đột đồng bộ" để người dùng xem ảnh hiện tại và quyết định ghi đè (nếu có quyền) hoặc hủy bỏ bản draft, tránh mất ảnh đã chụp.
    - Nếu `version != expected_version`:
      - Trả về HTTP 409 Conflict (Strict Optimistic Locking) kèm thông tin phiên bản hiện tại trên server (`current_status`, `current_version`) để client hiển thị Diff View cho người dùng quyết định ghi đè hoặc giữ bản nháp.
    - **Ghi đè sau xung đột (Force Overwrite)**: Sau Conflict Resolution View, client gửi lại request kèm `force=true` và `expected_version` = phiên bản server vừa đọc được. Server chỉ chấp nhận force khi user có quyền `close` issue đó; cho phép ghi đè `photo_after` (file cũ thành orphan, Orphan Cleaner dọn), set lại `status='PENDING_REVIEW'`, `resolver_id` = người gửi, `version + 1`. Không có đường ghi đè nào bỏ qua ràng buộc quyền.
  - Kết quả thành công: Gán `resolver_id = current_user.id`, update `status = 'PENDING_REVIEW'`, `resolved_at = NOW()`, `version = version + 1`.
- `POST /api/issues/{id}/close` (Duyệt đạt)
  - Điều kiện trạng thái: Bắt buộc `status = 'PENDING_REVIEW'` (phải có bằng chứng khắc phục `photo_after`); ngược lại trả 409 `ISSUE_CONFLICT` kèm `current_status`, `current_version`.
  - Điều kiện quyền:
    - Nếu issue là `6S (Safety)`: Bắt buộc role `SAFETY_OFFICER` hoặc `ADMIN`.
    - Nếu issue là `1S - 5S`: `current_user.id == issue.creator_id` HOẶC `current_user.role IN ('ADMIN', 'SAFETY_OFFICER')` HOẶC (`current_user.role == 'LINE_LEADER'` VÀ `current_user.assigned_location_code == issue.location_code`).
  - Body: `{"score_rating": 5, "expected_version": 2}` (score_rating 1-5 mặc định 3; `expected_version` tùy chọn — gửi mà lệch thì 409 như `resolve`).
  - Kết quả: UPDATE guard atomic `WHERE id = $1 AND status = 'PENDING_REVIEW' AND version = COALESCE($2, version)` (chặn double-close khi 2 Admin cùng duyệt), set `status='CLOSED'`, `score_rating`, `closed_at = NOW()`, `version = version + 1`. Cùng transaction ghi `score_logs`: reward Creator (`target_type='USER'`) và bonus kaizen nếu 5 sao (`target_type='LOCATION'`).

- `POST /api/issues/{id}/reopen` (Từ chối duyệt - Yêu cầu làm lại)
  - Điều kiện trạng thái: `status = 'PENDING_REVIEW'` (từ chối kết quả khắc phục đang chờ duyệt). Điều kiện quyền: Khớp quyền tương tự `close`.
  - Body: `{"reject_reason": "Chưa dọn sạch dầu / Dây điện vẫn chưa bọc kỹ", "expected_version": 2}` (lệch version -> 409)
  - Kết quả: UPDATE guard theo status + version: `status = 'OPEN'`, `reject_reason = body.reject_reason`, `version = version + 1` (giữ `photo_after` cũ làm bằng chứng lượt sửa trước; lượt resolve mới ghi đè file), ghi `score_logs` `penalty_reopen` (`target_type='LOCATION'`), ghi `notification_outbox` event `REOPENED` để bắn thông báo qua WeChat / Webhook.

- `POST /api/issues/{id}/invalid` (Bác bỏ issue do báo sai / spam)
  - Điều kiện trạng thái: `status IN ('OPEN', 'PENDING_REVIEW')`; ngược lại 409. Điều kiện quyền: `current_user.role IN ('ADMIN', 'SAFETY_OFFICER')`.
  - Body: `{"reason": "Ảnh không rõ ràng / Báo cáo không đúng thực tế", "expected_version": 2}` (lệch version -> 409).
  - Kết quả: UPDATE guard theo status + version: `status = 'INVALID'`, `reject_reason = body.reason`, `version = version + 1`, ghi `system_audit_logs`, ghi `score_logs` phạt Creator theo `penalty_reporter_invalid` (`target_type='USER'`).
- `PATCH /api/issues/{id}` (Sửa nhanh phân loại hoặc tags khi phát hiện sai)
  - Điều kiện: `current_user.id == issue.creator_id` HOẶC `current_user.id == issue.resolver_id` HOẶC `current_user.role IN ('ADMIN', 'SAFETY_OFFICER')`.
  - Body: `{"category": "6S", "location_code": "LINE_A1", "tags": ["nguy_hiểm", "dây_điện"]}`.
  - Kết quả: Cập nhật DB, tăng `version = version + 1`. Nếu đổi sang `6S`, ghi nhận outbox để kích hoạt thông báo khẩn cấp WeChat / Webhook.
- **Tên endpoint thực tế**: User administration dùng `PATCH /api/admin/users/{id}` và `GET /api/admin/users/`; issue invalidation dùng `/api/issues/{id}/invalid`.
- **Sự kiện realtime**: `GET /api/issues/events` dùng Server-Sent Events (SSE), yêu cầu xác thực.
- **Export**: `GET /api/issues/export` xuất CSV, yêu cầu xác thực.
**OpenAPI**: `openapi.yaml` là contract máy đọc; mọi route mới phải cập nhật đồng thời tại đây và trong mục API này.

### 6.4. Chấm điểm & Bảng xếp hạng (Scoring & Leaderboard)
- `GET /api/leaderboard/locations` (Bảng sức khỏe khu vực)
  - Trả về danh sách khu vực chuẩn hóa kèm điểm sức khỏe tính theo tuần (HTTP 200 - Envelope):
    ```json
    {
      "data": [
        {"location_code": "LINE_A2", "location_name": "Chuyền May A2", "health_score": 72, "open_count": 8, "overdue_count": 2},
        {"location_code": "WAREHOUSE_RAW", "location_name": "Kho Nguyên Liệu", "health_score": 95, "open_count": 1, "overdue_count": 0}
      ]
    }
    ```
- `GET /api/leaderboard/reporters` (Top Thợ săn 6S - Vinh danh cá nhân)
  - Trả về danh sách người báo cáo có điểm cao nhất tháng (HTTP 200 - Envelope):
    ```json
    {
      "data": [
        {"user_id": 12, "full_name": "Nguyễn Văn A", "points": 35, "valid_count": 14, "safety_count": 3},
        {"user_id": 5,  "full_name": "Trần Thị B",   "points": 24, "valid_count": 12, "safety_count": 0}
      ]
    }
    ```
- `GET /api/config/scoring`
  - Trả về danh sách quy tắc chấm điểm hiện hành trong bảng `scoring_rules`.
- `PUT /api/config/scoring` (Dành riêng cho Admin - Cập nhật điểm & Hồi tố)
  - Header: Role Admin
  - Body:
    ```json
    {
      "rules": {
        "penalty_normal": -3,
        "penalty_safety": -20,
        "penalty_overdue": -5,
        "bonus_kaizen": 10,
        "reward_reporter_normal": 2,
        "reward_reporter_safety": 5,
        "penalty_reporter_invalid": -5
      },
      "apply_from": "2026-09-01T00:00:00Z", // Tùy chọn mốc hồi tố (nếu có)
      "reason": "Chỉ đạo BGĐ tăng phạt lỗi an toàn x2 từ đầu tuần" // Bắt buộc khi có apply_from
    }
    ```
  - Kết quả:
    - Cập nhật bảng `scoring_rules`.
    - Nếu có `apply_from`: Chạy recalculate chèn các **entry điều chỉnh delta** (`rule_key = 'retro_adjust'`, points = delta, target giữ nguyên) vào `score_logs` cho các bản ghi từ `apply_from` trở đi — KHÔNG update trực tiếp entry cũ (bảo toàn tính bất biến của sổ cái).
    - Ghi log vào `system_audit_logs` (`target_table = 'scoring_rules'`, `action = 'RECALCULATE_RETROACTIVE'`).

### 6.5. Cấu hình Active Directory / LDAP (Admin Dynamic Config)
- `GET /api/config/ad`
  - Header: Role Admin
  - Trả về cấu hình hiện hành từ bảng `ad_configs` (che giấu mật khẩu `bind_password`, HTTP 200 - Envelope):
    ```json
    {
      "data": {
        "is_enabled": true,
        "server": "ad.factory.lan",
        "port": 636,
        "use_tls": true,
        "skip_tls_verify": false,
        "base_dn": "DC=factory,DC=lan",
        "bind_dn": "CN=svc_6s_auth,OU=Services,DC=factory,DC=lan",
        "has_bind_password": true,
        "user_filter": "(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=%s)(userPrincipalName=%s)))",
        "group_admin_dn": "CN=6S_Admins,OU=Groups,DC=factory,DC=lan",
        "group_safety_dn": "CN=6S_SafetyOfficers,OU=Groups,DC=factory,DC=lan",
        "group_leader_dn": "CN=6S_LineLeaders,OU=Groups,DC=factory,DC=lan",
        "updated_at": "2026-09-04T08:00:00Z"
      }
    }
    ```
- `PUT /api/config/ad` (Cập nhật cấu hình AD trực tiếp vào DB)
  - Header: Role Admin
  - Body:
    ```json
    {
      "is_enabled": true,
      "server": "ad.factory.lan",
      "port": 636,
      "use_tls": true,
      "skip_tls_verify": false,
      "base_dn": "DC=factory,DC=lan",
      "bind_dn": "CN=svc_6s_auth,OU=Services,DC=factory,DC=lan",
      "bind_password": "NewSecretPassword", // Tùy chọn, chỉ gửi khi thay đổi
      "user_filter": "(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=%s)(userPrincipalName=%s)))",
      "group_admin_dn": "CN=6S_Admins,OU=Groups,DC=factory,DC=lan",
      "group_safety_dn": "CN=6S_SafetyOfficers,OU=Groups,DC=factory,DC=lan",
      "group_leader_dn": "CN=6S_LineLeaders,OU=Groups,DC=factory,DC=lan"
    }
    ```
  - Xử lý:
    - Upsert vào bảng `ad_configs` (`id = 1`).
    - Ghi nhận `system_audit_logs` (`action = 'UPDATE_AD_CONFIG'`).
    - Backend lập tức reload connection pool / client LDAP mà không cần khởi động lại Go server.
- `POST /api/config/ad/test` (Kiểm tra kết nối và bind thử với AD)
  - Header: Role Admin
  - Body: Gửi kèm cấu hình muốn test hoặc để trống để test cấu hình hiện hành trong DB.
  - Trả về: `{"data": {"success": true, "message": "LDAP connection & service bind OK"}}` hoặc HTTP 400 (Error Envelope) kèm lỗi chi tiết (`Lỗi DNS`, `Sai TLS certificate`, `Sai thông tin Bind DN`).

### 6.6. Users Admin & Cấu hình Kênh Thông Báo (Admin)
- `PATCH /api/admin/users/{id}` (Admin): Body `{"role": "...", "assigned_location_code": "LINE_A2", "is_active": false}` — BẮT BUỘC cho luồng AD JIT: group mapping chỉ quyết định `role`, còn `assigned_location_code` luôn rỗng lúc provision -> Line Leader đồng bộ từ AD phải được Admin gán chuyền qua endpoint này thì các rule "duyệt/reopen chuyền mình" mới hoạt động. Ghi `system_audit_logs` (`action='USER_UPDATED'`).
- `GET /api/admin/users/` (Admin): danh mục nhân sự phục vụ màn Admin.
### 6.7. AI & Dịch tự động
- `GET /api/config/ai`, `PUT /api/config/ai`, `POST /api/config/ai/test`, `POST /api/config/ai/test-dns`: Admin-only; cấu hình provider OpenAI-compatible, model, base URL và kiểm tra kết nối/DNS.
- `GET /api/ai/status`: User đã xác thực; chỉ trả trạng thái bật/tắt, không lộ secret.
- `POST /api/ai/translate`: User đã xác thực; dịch nội dung giới hạn kích thước, hỗ trợ cache.
- `POST /api/ai/cached`: User đã xác thực; tra cache trước khi gọi provider.
- `POST /api/ai/review`, `POST /api/ai/review-follow-up`: User đã xác thực; AI review issue và hỏi tiếp.
- Provider lỗi, timeout hoặc AI tắt: trả error envelope chuẩn; không làm mất issue/offline draft.

### 6.8. Error Localization
- Error envelope gồm `code`, `key`, `message`, tùy chọn `details`.
- `message` bản địa hóa theo locale `vi`, `en`, `zh` từ request; `key` ổn định cho client.

---

### 6.9. Cấu hình Kênh Thông Báo & Health
- `GET /api/admin/users/` (Admin): danh mục nhân sự phục vụ màn Admin.
- `GET /api/config/notifications` (Admin): trả bản ghi `notification_configs` (`id=1`), ẩn secret, chỉ trả cờ `has_app_token` / `has_webhook_url`.
- `PUT /api/config/notifications` (Admin): upsert cấu hình; mã hóa AES-256-GCM; chỉ gửi secret khi thay đổi.
- `POST /api/config/notifications/test` (Admin): gửi tin test theo từng kênh.
- `GET /api/health` (public): trả trạng thái service và DB cho probe PWA/liveness.

---

## 7. CLIENT PWA & LUỒNG OFFLINE (REACT)
- PWA assets: `web/public/manifest.webmanifest`, `web/public/sw.js`; Service Worker đăng ký từ `web/src/main.tsx` chỉ khi chạy HTTPS.
- Service Worker precache app shell, fallback `index.html` cho SPA navigation offline; bypass `/api/`, `/uploads/`.
- Install flow: `beforeinstallprompt` trên Chromium; hướng dẫn cài thủ công trên iOS.
- IndexedDB lưu `draft_issues`, `draft_resolves`, `auth_session`; `syncEngine` đồng bộ khi online, xử lý HTTP 409 conflict.
- Cache Service Worker không phải nguồn dữ liệu nghiệp vụ; draft chờ gửi nằm trong IndexedDB.

### 7.1. Xử lý ảnh tại Client (Tiết kiệm bộ nhớ & băng thông)
- Input: File gốc từ camera điện thoại (thường 5MB - 15MB).
- Thao tác: Dùng HTML5 Canvas resize chiều dài nhất về tối đa 1280px.
- Định dạng: Chuyển đổi thành `image/jpeg` với chất lượng `0.7` (Dung lượng sau nén: ~150KB - 300KB).

### 7.2. Lưu trữ IndexedDB (`6s_local_db`)
Gồm 2 object stores độc lập:

**1. Store `draft_issues` (Báo cáo lỗi mới offline):**
```javascript
{
  client_uuid: "uuid-v4-string",
  category: "1S",
  location_code: "LINE_A2", // Chuẩn hóa mã vị trí theo Master Data
  tags: ["oil_leak", "safety_gear"],
  description: "Dầu máy chảy ra sàn",
  photo_before_blob: Blob, // Toàn cảnh
  photo_detail_blob: Blob, // Cận cảnh/Annotation (tùy chọn)
  created_at: 1718000000000,
  sync_status: "PENDING" // "PENDING" | "SYNCING" | "FAILED"
}
```

**2. Store `draft_resolves` (Khắc phục lỗi offline):**
```javascript
{
  resolved_client_uuid: "uuid-v4-string",
  issue_id: 123,
  expected_version: 1, // Snapshot version lúc bắt đầu sửa để đối chiếu optimistic lock
  photo_after_blob: Blob,
  resolved_at: 1718000000000,
  sync_status: "PENDING" // "PENDING" | "SYNCING" | "FAILED" | "CONFLICT"
}
```
### 7.2.1. Quản lý Session Client
- Tuân thủ chuẩn bảo mật Mục 7.3.4: `access_token` (1h) chỉ lưu trong bộ nhớ RAM (Zustand store `authStore`), không lưu vào bất kỳ Web Storage nào.
- `refresh_token` (30 ngày) được lưu trữ an toàn trong IndexedDB (`6s_local_db`), kết hợp Content Security Policy `default-src 'self'` để chống rủi ro XSS. Tuyệt đối không dùng `localStorage` để lưu credentials.

### 7.3. Cơ chế Auto-Sync & Xử lý Xung đột Ngoại tuyến (Offline Concurrency Resolution)
1. **Lắng nghe mạng**:
   - Sự kiện `window.addEventListener('online', triggerSync)`.
   - Polling định kỳ mỗi 30 giây gọi `HEAD /api/health`.
2. **Tiến trình sync an toàn & Xử lý Conflict (HTTP 409)**:
   - **Bước 1 (Sync Issues mới)**: Đọc `draft_issues` -> Đổi trạng thái sang `SYNCING` -> Bật vi sợi tiến trình upload (%) trên Status Bar qua `XMLHttpRequest.upload.onprogress` hoặc `fetch` stream -> POST `multipart/form-data` lên `/api/issues/sync` -> Nhận 200/201 thì xóa khỏi IndexedDB.
   - **Bước 2 (Sync Khắc phục)**: Đọc `draft_resolves` -> Đổi trạng thái sang `SYNCING` kèm progress bar -> POST lên `/api/issues/{issue_id}/resolve` gửi kèm `expected_version`:
     - **Thành công (200)**: Xóa record khỏi IndexedDB.
     - **Xung đột (HTTP 409 Conflict)**: Giữ nguyên record, chuyển `sync_status = 'CONFLICT'`. Giao diện hiển thị huy hiệu cảnh báo màu cam "1 xung đột cần xử lý".
       - **Màn hình Diff trực quan (Conflict Resolution View)**:
         - Trên Mobile (< 640px): Dùng Segmented Toggle 1 chạm chuyển đổi giữa `[Bản máy này]` và `[Bản máy chủ]` kèm vuốt ngang (Swipe Tab), tránh ép 2 cột gây vỡ layout trên màn hình hẹp 360px.
         - Trên Tablet/Desktop (>= 640px): Hiển thị Side-by-Side 2 cột đối chiếu trực tiếp.
       - Hai lựa chọn xử lý rõ ràng: `[Ghi đè bản ghi]` (nếu có thẩm quyền) hoặc `[Lưu ảnh về máy & Hủy bản nháp]` để đảm bảo zero-data-loss mà không gây mơ hồ cho công nhân.
     - **Lỗi mạng**: Reset trạng thái về lại `PENDING` để lần sau thử lại.
3. **Cơ chế Duy trì Phiên Ngoại Tuyến (Offline Session Grace Period)**:
   - Khi di chuyển vào vùng mất sóng Wi-Fi, nếu JWT Access Token hết hạn (sau 3600 giây / 60 phút), client **tuyệt đối không đăng xuất hoặc chuyển hướng về màn hình Login**.
   - Client duy trì chế độ `Offline Grace Mode`: Tiếp tục cho phép lưu draft issues và ảnh vào IndexedDB gắn với user ID/profile đã cache.
   - Khi thiết bị phát hiện có mạng trở lại: Tự động chạy `POST /api/auth/refresh` bằng Refresh Token trong nền. Nếu refresh thành công, tiến trình Auto-Sync tự động kích hoạt. Chỉ yêu cầu đăng nhập lại nếu Refresh Token (30 ngày) đã thực sự hết hạn hoặc bị thu hồi.
4. **Lưu trữ Token phía Client**: `access_token` giữ trong memory (Zustand, không đụng storage); `refresh_token` lưu IndexedDB của `6s_local_db` (không dùng LocalStorage — cùng chính sách với draft, và không bị đọc bởi mọi script cùng origin dễ dàng hơn). Kèm CSP `default-src 'self'` cho PWA dùng chung tablet, chống XSS đánh cắp token.

## 8. THÔNG BÁO WECHAT QUA WXPUSHER & WEBHOOK DỰ PHÒNG NỘI BỘ

### 8.1. Cấu hình & Kênh phát tin đa tầng (Multi-channel Notification)
1. **Kênh chính**: WxPusher qua WeChat cá nhân (Outbound HTTPS ra Internet).
2. **Kênh dự phòng LAN (Air-gapped Fallback)**: Cấu hình Webhook nội bộ (DingTalk / Lark / Feishu On-Premise / Mattermost LAN).
   - Đối với cảnh báo `6S (Safety)` khẩn cấp: Tự động phát song song đồng thời cả WxPusher và Webhook LAN ngay lập tức (không chờ retry WxPusher thất bại).
   - Đối với cảnh báo thường: Nếu WxPusher retry thất bại hoặc server mất kết nối Internet, tự động kích hoạt fallback sang Webhook LAN.
### 8.2. Kiến trúc Transactional Outbox Worker (Kháng Crash & Zero-loss)
Mọi thông báo (WeChat / Webhook LAN) bắt buộc ghi vào bảng `notification_outbox` trong cùng Database Transaction tạo/sửa issue.

Worker nền trong Go xử lý độc lập:
```go
// Worker chạy theo mô hình Event-Driven kết hợp Ticker dự phòng:
// - Nhận signal qua Go channel (notifyCh chan struct{}) ngay khi có issue mới -> Độ trễ < 100ms.
// - Ticker 30s dự phòng chỉ quét khi có bản ghi retry hoặc phục hồi sau crash, giảm 90% tải I/O database.
func StartOutboxWorker(ctx context.Context, db *sql.DB, notifyCh <-chan struct{}) {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    type outboxTask struct {
        id, issueID, retryCount, maxRetries int
        channel, payloadStr string
    }

    processOutbox := func() {
        for {
            // Claim atomic bằng UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING:
            // đúng MỘT worker chuyển được PENDING -> SENDING (SELECT rồi COMMIT riêng lẻ sẽ nhả lock
            // trước khi gửi HTTP -> 2 worker gửi trùng tin). Lease 120s qua next_retry_at: worker crash
            // giữa dispatch thì row SENDING hết hạn lease được re-claim (at-least-once, chấp nhận được
            // với notification; HTTP timeout của dispatch phải < 120s).
            rows, err := db.QueryContext(ctx, `
                UPDATE notification_outbox
                SET status = 'SENDING',
                    next_retry_at = CURRENT_TIMESTAMP + INTERVAL '120 seconds'
                WHERE id IN (
                    SELECT id FROM notification_outbox
                    WHERE (status = 'PENDING' AND next_retry_at <= CURRENT_TIMESTAMP)
                       OR (status = 'SENDING' AND next_retry_at < CURRENT_TIMESTAMP)
                    ORDER BY id ASC LIMIT 20
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, issue_id, channel, payload, retry_count, max_retries
            `)
            if err != nil {
                return
            }

            var tasks []outboxTask
            for rows.Next() {
                var t outboxTask
                if err := rows.Scan(&t.id, &t.issueID, &t.channel, &t.payloadStr, &t.retryCount, &t.maxRetries); err == nil {
                    tasks = append(tasks, t)
                }
            }
            rows.Close() // Đóng kết nối đọc ngay trước khi gửi HTTP và ghi cập nhật DB, chống deadlock connection pool

            for _, t := range tasks {
                err := dispatchNotification(t.channel, t.payloadStr)
                if err == nil {
                    db.ExecContext(ctx, `UPDATE notification_outbox SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'SENDING'`, t.id)
                } else {
                    if t.retryCount + 1 >= t.maxRetries {
                        db.ExecContext(ctx, `UPDATE notification_outbox SET status = 'FAILED', last_error = $1 WHERE id = $2 AND status = 'SENDING'`, err.Error(), t.id)
                        queueLanFallback(ctx, db, t.issueID, t.payloadStr)
                    } else {
                        backoffSec := int(math.Pow(3, float64(t.retryCount+1)) * 5)
                        db.ExecContext(ctx, `
                            UPDATE notification_outbox 
                            SET status = 'PENDING',
                                retry_count = retry_count + 1, 
                                last_error = $1, 
                                next_retry_at = CURRENT_TIMESTAMP + ($2 || ' seconds')::INTERVAL 
                            WHERE id = $3 AND status = 'SENDING'`,
                            err.Error(), backoffSec, t.id,
                        )
                    }
                }
            }

            // Nếu hết batch thì dừng vòng lặp, đợi signal hoặc ticker kế tiếp
            if len(tasks) < 20 {
                break
            }
        }
    }
    for {
        select {
        case <-ctx.Done():
            return
        case <-notifyCh:
            processOutbox()
        case <-ticker.C:
            processOutbox()
        }
    }
}
```

## 9. TIÊU CHUẨN UI/UX ENTERPRISE (NHÀ XƯỞNG)
### 9.1. Công thái học một tay & Thao tác đeo găng (Glove & Thumb Ergonomics)
- **Touch target công nghiệp (Factory Glove Friendly)**:
  - Chiều cao tối thiểu của nút bấm chính (Chụp ảnh, Gửi báo cáo, Upload ảnh sửa, Duyệt đạt) đạt từ `56px - 64px` với vùng đệm padding rộng, đảm bảo công nhân đeo găng tay bảo hộ dính bụi/dầu vẫn chạm chính xác không bị trượt.
  - Các pill tag, icon phụ tối thiểu `48x48px` (chuẩn WCAG AA).
- **Bottom-first layout**: Nút hành động chính đặt cố định ở cạnh đáy màn hình (Bottom Sticky Bar), thao tác thuận tiện bằng 1 ngón cái.
### 9.2. Giảm thiểu nhập liệu (Zero-typing Priority)
- **Chụp ảnh 1 chạm**: Bấm nút camera tự động kích hoạt camera sau (`<input type="file" capture="environment">`).
- **Selection dạng Pill/Chip**: Vị trí thường gặp, phân loại 1S-6S, và danh sách tags xếp theo tần suất hiển thị dạng button chip chọn nhanh bằng 1 chạm, loại bỏ dropdown select truyền thống.
- **Mô tả text không bắt buộc**: Hình ảnh là bằng chứng cốt lõi.

### 9.3. Minh bạch trạng thái mạng & Tiến trình Tải ngầm (Optimistic UI & Dynamic Sync Progress)
- **Status Bar cố định đỉnh màn hình**:
  - Xanh: "Đã kết nối LAN".
  - Cam/Vàng: "Đang ngoại tuyến — Còn [N] báo cáo chờ gửi" (Nhấp vào mở Drawer Quản lý Ngoại tuyến).
- **Vi sợi tiến trình tải ngầm (Micro Progress Bar & Retry Indicator)**:
  - Khi bắt đầu sync ngầm, mép dưới Status Bar hiển thị vi sợi tiến trình màu xanh biển `2px` cập nhật % byte đã upload theo thời gian thực (tránh treo ngầm không rõ trạng thái).
  - Nếu mạng Wi-Fi chập chờn bị retry: Hiển thị nhãn nhỏ `"Đang thử lại lần [K]/5..."` để người dùng an tâm không thao tác trùng lặp.
- **Drawer Quản lý Hàng đợi Ngoại tuyến (Offline Outbox Drawer)**:
  - Chạm vào Status Bar mở Bottom Sheet/Drawer hiển thị toàn bộ danh sách bản nháp (`draft_issues` và `draft_resolves`) đang lưu trong IndexedDB.
  - Mỗi item gồm: Thumbnail ảnh, mã vị trí, phân loại S, thời gian tạo, huy hiệu trạng thái (`PENDING`, `SYNCING`, `FAILED`, `CONFLICT`).
  - Thao tác nhanh: Nút `[Thử lại tất cả]` kích hoạt sync ngay lập tức, nút `[Xem/Sửa]` bản nháp, và nút `[Hủy]` kèm hộp thoại xác nhận an toàn, tránh tình trạng 1 bản ghi lỗi kẹt vĩnh viễn không thể dọn dẹp.
- **Lưu tức thì, không xoay loading chặn màn hình**: Bấm gửi lập tức lưu IndexedDB, hiển thị thông báo thành công và trả về màn hình chính ngay. Việc sync dữ liệu chạy nền hoàn toàn.

### 9.4. Khả đọc & Tương phản (Readability / Contrast)
- **Tỉ lệ tương phản (Contrast Ratio)**: Đạt tối thiểu `4.5:1` (chuẩn WCAG AA). Nền trung tính (trắng xám `#F3F4F6`), chữ đen đậm (`#111827`). Tránh chữ xám nhạt mờ.
- **Cỡ chữ**: Tối thiểu `16px` cho body text (chống Safari/Chrome mobile tự phóng to khi focus ô input), `18px-24px` cho tiêu đề và nhãn trạng thái.
- `Màu trạng thái đi kèm Icon (Chống nhầm lẫn màu sắc)`:
  - `OPEN`: Đỏ (`#DC2626`) + Icon chấm than cảnh báo.
  - `PENDING_REVIEW`: Cam (`#D97706`) + Icon đồng hồ chờ duyệt.
  - `CLOSED`: Xanh lá (`#16A34A`) + Icon dấu tích hoàn thành.
### 9.5. Hiệu năng thiết bị thấp & Chống giật lag (Low-end Device Optimization)
- Sử dụng Tailwind CSS v4.3+ với engine Oxide, không cài đặt các bộ thư viện UI cồng kềnh (MUI, Ant Design).
- Bundle JavaScript gzipped < 150KB. Thời gian tải lần đầu < 1.5s trên mạng 3G/LAN yếu.
- **Tối ưu hóa máy yếu & Chế độ giảm chuyển động (`prefers-reduced-motion`)**:
  - Tự động tắt animation shimmer skeleton và các hiệu ứng chuyển cảnh nặng khi thiết bị bật chế độ tiết kiệm pin hoặc hệ thống yêu cầu giảm chuyển động, thay bằng màu nền tĩnh nhẹ (`#E5E7EB` / `#27272A`).
  - Canvas vẽ đè tối ưu kích thước bộ đệm nội bộ theo tỉ lệ màn hình vật lý, không tạo layer phức hợp chống tụt FPS trên điện thoại Android giá rẻ.

### 9.6. Hiển thị song ngữ / đa ngôn ngữ tại nhà xưởng (Multilingual Display)
- **Pill Tag song ngữ mặc định**: Nút bấm hiển thị dạng `Tiếng Việt / 中文` (ví dụ: `Rò rỉ dầu / 漏油`, `Chắn lối đi / 堵塞通道`). Công nhân bản địa và quản lý nước ngoài đọc hiểu cùng lúc không cần đổi ngôn ngữ app.
- **Lưu mã code định danh**: Database và IndexedDB chỉ lưu `code` (`oil_leak`, `blocked_aisle`), đảm bảo báo cáo, lọc dữ liệu và thống kê nhất quán toàn xưởng.

### 9.7. Tính năng Trải nghiệm Nhà xưởng (Phân kỳ Phase 1 MVP & Phase 2 YAGNI)

#### Phase 1 (MVP Cốt lõi Bắt buộc - Scope Khóa Cứng cho Mọi Agent):
1. **Bối cảnh lỗi kép (Dual-Shot Context: Wide + Detail)**:
   - Ảnh 1 (Bắt buộc): Toàn cảnh (Wide Shot) góc rộng xác định vị trí trên chuyền.
   - Ảnh 2 (Tùy chọn): Cận cảnh (Detail Shot) điểm phát sinh lỗi.
2. **Quét QR vị trí công nghiệp**:
   - Quét mã QR vị trí dán trên cột/máy bằng `BarcodeDetector` API native (hoặc camera fallback) để tự động điền vị trí, không cần gõ tay.
3. **Phản hồi rung vật lý (Haptic Feedback)**:
   - Bù đắp tiếng ồn máy móc bằng `navigator.vibrate`: Ghi nhận thành công (`50ms`), Chọn 6S (`50ms-50ms-100ms`), Lỗi/Xung đột (`200ms`).
4. **Zero Layout Shift (CLS = 0)**:
   - Khung hiển thị ảnh cố định tỉ lệ `aspect-ratio: 4/3` kết hợp shimmer skeleton chống giật layout khi tải mạng LAN chậm.
5. **Offline Sync & Xử lý Conflict (Optimistic Lock)**:
   - Quản lý hàng đợi `draft_issues` và `draft_resolves` qua IndexedDB, tự động sync khi online, xử lý 409 Conflict với UI đối chiếu.
6. **Vòng đời Issue & RBAC 4 cấp**:
   - Đầy đủ chuyển trạng thái `OPEN` -> `PENDING_REVIEW` -> `CLOSED` / `REOPEN` / `INVALID`.
7. **Điểm sức khỏe tuần & Bảng xếp hạng**:
   - Tính toán real-time theo công thức Mục 5.3.D cho khu vực và thợ săn 6S.
8. **Transactional Outbox Worker**:
   - Ghi outbox trong transaction và worker gửi WxPusher / Webhook LAN.

#### Phase 2 (Scope Mở Rộng - YAGNI - Tuyệt đối không sinh code ở Phase 1):
1. **Photo Canvas Annotation đa lớp**: Vẽ vòng tròn đỏ / mũi tên đè lên ảnh cận cảnh trên Canvas.
2. **Hồi tố điểm số trong quá khứ**: Cập nhật lại `score_logs` theo `apply_from`.
3. **In nhãn Decal nhiệt công nghiệp**: Trang in CSS Media Print khổ `50mm x 30mm` hoặc `70mm x 50mm` xuất hàng loạt tem QR.
### 9.8. Thiết kế Layout chi tiết: Điểm số & Duyệt Kaizen

#### A. Widget Điểm sức khỏe & Bảng xếp hạng (Trang chủ)
- **Đồng hồ điểm màu (Health Gauge Ring)**:
  - Hiển thị điểm số trung bình toàn xưởng ở góc trên trang chủ:
    - `>= 80`: Vòng xanh lá (Đạt chuẩn).
    - `50 - 79`: Vòng vàng cam (Cảnh báo).
    - `< 50`: Vòng đỏ chớp nháy (Nguy cấp).
- **Hai Tab Xếp Hạng Linh Hoạt**:
  - **Tab 1: Sức khỏe Khu vực**: Xếp hạng chuyền theo thứ tự điểm thấp nhất lên đầu (khu vực có vấn đề ưu tiên xử lý trước). Mỗi thẻ hiển thị: Tên khu vực, điểm hiện tại, số lượng lỗi `OPEN`, số lượng lỗi quá 48h (Badge đỏ). Chạm vào thẻ -> lọc danh sách issue của khu vực đó.
  - **Tab 2: Top Thợ săn 6S (Vinh danh cá nhân)**: Xếp hạng nhân viên có điểm đóng góp cao nhất trong tháng (chỉ tính các issue đã được duyệt `CLOSED`). Thẻ top 1-3 có huy hiệu Vàng, Bạc, Đồng kèm số issue an toàn đã phát hiện.
- **Thanh Lọc Nhanh 1 Chạm (Factory Quick Facets)**:
  - Dải chip lọc cuộn ngang đặt ngay dưới Status Bar / Health Gauge:
    - `[Tất cả]`
    - `[Của tôi]` (Issue do chính tài khoản tạo)
    - `[Chuyền của tôi]` (Tự động lọc theo `assigned_location_code`)
    - `[Khẩn cấp 6S]` (Chỉ lọc issue an toàn)
    - `[Tồn đọng > 48h]` (Cảnh báo quá hạn SLA)
    - `[Chờ tôi duyệt]` (Hiển thị cho Line Leader/Safety Officer khi có issue `PENDING_REVIEW` thuộc phạm vi)
  - Bấm chọn 1 chạm, tự động lưu preference lọc vào LocalStorage của thiết bị.

#### B. Giao diện Thẻ duyệt Kaizen & Chấm sao (Màn hình Chi tiết Issue)
  - Dùng 1 khung ảnh duy nhất tỉ lệ 4:3, có vạch phân cách kéo trượt (Split Slider) giữa ảnh Before và After.
  - Kéo sang trái/phải để so sánh từng chi tiết thay đổi sau khi khắc phục.
- **Thanh đánh giá 5 sao (Rating Stars) khi duyệt**:
  - Nằm ngay phía trên nút `Xác nhận đạt (Close)`:
    - Mặc định: 3 sao (Đạt yêu cầu).
    - 5 sao: Nút sáng vàng kèm nhãn `Kaizen Xuất Sắc (+5 điểm)`.

#### C. Màn hình Cấu hình điểm Admin (Quick Stepper Settings & Hồi tố)
- Thiết kế dạng thẻ danh sách các quy tắc (Penalty/Bonus).
- Mỗi dòng gồm: Tên quy tắc, mô tả ngắn, và cụm nút bấm `[-] [ Giá trị ] [+]` với bước nhảy 1 đơn vị.
- Không yêu cầu bật bàn phím ảo, thao tác tăng giảm điểm phạt/thưởng chỉ bằng các cú chạm ngón tay.
- **Tùy chọn Hồi tố (Retroactive Controls)**:
  - Checkbox: `[ ] Áp dụng hồi tố cho quá khứ`.
  - Nếu tích chọn: Hiện ô chọn ngày `apply_from` (Mặc định: Ngày đầu tuần hiện tại) + Ô nhập lý do điều chỉnh (`reason`).
  - Modal xác nhận 2 bước: Cảnh báo rõ số lượng bản ghi điểm sẽ bị tính toán lại trước khi bấm xác nhận.


#### D. Màn hình Cấu hình Active Directory / LDAP (Admin AD Settings)
- Chỉ hiển thị khi đăng nhập với role `ADMIN`.
- **Công tắc kích hoạt**: Toggle Switch lớn `[ Bật xác thực Active Directory ]`.
- **Form kết nối trực quan**:
  - Server IP/Host (`ad.factory.lan`), Cổng (`636` hoặc `389`), Toggle `Sử dụng TLS (LDAPS)`.
  - Base DN (`DC=factory,DC=lan`), Bind DN (`CN=svc_6s_auth,OU=Services,...`), Bind Password (ẩn dạng `••••••••`, có nút xem/đổi).
  - Filter User và Mapping DN cho 3 nhóm quyền: `Admin Group`, `Safety Officer Group`, `Line Leader Group`.
- **Nút kiểm tra kết nối 1 chạm `[ Kiểm tra kết nối AD ]`**:
  - Gọi `POST /api/config/ad/test` để test ping & bind tài khoản dịch vụ.
  - Báo trạng thái xanh kèm thời gian phản hồi (ví dụ: `Đã kết nối thành công (24ms)`) hoặc báo đỏ kèm lỗi chi tiết giúp admin khắc phục ngay mà không cần tra cứu log server.
- Nút `[ Lưu cấu hình ]`: Ghi trực tiếp vào bảng `ad_configs` trong DB, kích hoạt hot-reload tức thì.
### 9.9. Chuẩn hóa Enterprise Premium UX (Môi trường Điều hành & Nhà xưởng Chuyên sâu)

#### A. High-Contrast Dark Mode & Chống lóa ánh sáng mạnh (Factory Glare Resistance)
- **Công tắc chuyển chế độ 1 chạm**: Nằm ngay góc phải Status Bar đỉnh màn hình, chuyển đổi tức thì giữa Light Mode và High-Contrast Dark Mode.
- **Bảng màu Dark Mode tiêu chuẩn công nghiệp (OLED High-Contrast)**:
  - Nền chính: `#09090B` (giảm mỏi mắt trong ca đêm và tiết kiệm pin trên màn hình AMOLED/OLED).
  - Nền thẻ (Surface): `#18181B`, viền tương phản sắc nét `#27272A`.
  - Văn bản: `#FAFAFA` (đạt contrast ratio `12:1`, vượt xa chuẩn WCAG AAA).
  - Màu nhấn trạng thái giữ nguyên mã màu cảnh báo tiêu chuẩn nhưng tăng độ bão hòa (Vivid Alert Colors) để nhận diện tức thì dưới đèn LED cao áp hoặc ánh sáng chói.

#### B. Thiết kế Đầy đủ Trạng thái (Zero-Data, Filter-Empty & Offline Cache Warming)
- **Empty State có tính định hướng hành động (Actionable Zero-State)**:
  - Khi chưa có issue nào hoặc ca làm việc mới: Minh họa đồ họa phẳng tối giản kèm nút CTA lớn `[ Quét QR Báo Lỗi Ngay ]`.
  - Khi bộ lọc không có kết quả: Hiển thị thông báo "Không tìm thấy lỗi phù hợp" kèm nút 1 chạm `[ Xóa tất cả bộ lọc ]`.
- **Offline Cache Warming Banner (Trải nghiệm mở app lần đầu)**:
  - Khi thiết bị truy cập lần đầu có mạng: Tự động tải ngầm và nạp Master Data (Locations, Tags, Active Rules) vào IndexedDB.
  - Thanh trạng thái hiển thị vi sợi tiến trình tinh tế: "Đã nạp dữ liệu ngoại tuyến 100% — Sẵn sàng làm việc ngoài vùng phủ sóng".

#### C. Hộp thoại xác nhận thao tác trọng yếu (Graceful Action Confirmation)
- **Xác nhận 1 chạm bằng Modal/Dialog (Thay thế timer đệm 5s)**:
  - Đối với các hành động trọng yếu: Chuyển issue thành `6S (Safety)` (kích hoạt cảnh báo khẩn cấp), Đóng issue (`CLOSE`), hoặc Mở lại (`REOPEN`).
  - Giao diện hiển thị Confirm Dialog/Action Sheet native: Nêu rõ hành động sắp thực hiện và hệ quả (Ví dụ: `"Duyệt đóng issue #123 và cộng điểm cho người báo cáo?"`).
  - Công nhân hoặc Line Leader bấm xác nhận -> Client lưu thẳng bản ghi vào IndexedDB và kích hoạt Auto-Sync. Loại bỏ cơ chế đếm lùi 5s `is_buffered` để tránh phức tạp hóa state machine ngoại tuyến và triệt tiêu nguy cơ race condition.
  - Nếu cần đảo ngược hành động sau khi đã đồng bộ lên server: Sử dụng quy trình chuẩn theo quyền RBAC (ví dụ: dùng `REOPEN` để mở lại issue sau khi đã `CLOSE`).
#### E. Bàn Điều Hành Quản Lý (Phase 2 — Chưa Thuộc Hợp Đồng API Phase 1)
- *Lưu ý YAGNI: các mục E dưới đây (layout 2 cột, hotkeys, xuất PDF/Excel, bulk actions) chưa có endpoint tương ứng trong Mục 6. Khi kích hoạt Phase 2 phải bổ sung API (`POST /api/issues/bulk`, `GET /api/reports/export`) hoặc chốt phương án client-loop từng item kèm confirm — không được tính vào effort Phase 1.*
- Phục vụ Line Leader, Safety Officer và Ban Giám Đốc điều hành:
- **Responsive 2-Cột (Master - Detail Grid)** trên màn hình $\ge 768\text{px}$:
  - Cột trái (35%): Danh sách issue dạng bảng gọn, hỗ trợ phân loại theo SLA, mức độ nguy cấp, vị trí.
  - Cột phải (65%): Chi tiết issue với màn hình so sánh Before/After Split-Slider khổ lớn, lịch sử xử lý, nút duyệt và chấm điểm sao.
- **Phím tắt chuyên nghiệp (Keyboard Hotkeys)** cho quản lý thao tác tốc độ cao:
  - `J` / `K`: Di chuyển lên / xuống danh sách issue.
  - `Space`: Phóng to / thu nhỏ ảnh so sánh Before - After.
  - `1` đến `5`: Đánh giá chất lượng khắc phục (1 - 5 sao).
  - `Enter`: Duyệt đạt (`CLOSE`).
  - `R`: Mở lại (`REOPEN`).
- **Xuất Báo cáo Giao ban 1 Chạm (One-Click Handover Report Export)**:
  - Xuất bảng đối chiếu Kaizen dạng file PDF/Excel khổ chuẩn A4 có sẵn ảnh Before - After, điểm trừ khu vực, phục vụ họp giao ban đầu ca sản xuất.
- **Tác vụ Hàng loạt cho Quản lý (Bulk Actions - Zero Fatigue)**:
  - Cho phép Line Leader và Safety Officer tích chọn nhiều issue (`Multi-select Checkbox` hoặc giữ phím `Shift + Click` / phím tắt `X`).
  - Floating Action Bar đáy màn hình xuất hiện với 2 thao tác 1 chạm:
    - `[Duyệt đạt hàng loạt (Bulk Close)]`: Tự động gán 3 sao chuẩn cho tất cả issue thường đã chọn (chặn chọn kèm issue 6S để tránh duyệt nhầm an toàn).
    - `[Bác bỏ hàng loạt (Bulk Invalidate)]`: Nhập 1 lý do chung và đánh dấu toàn bộ.

#### F. Minh bạch Thẩm quyền theo Vai trò trên Giao diện (RBAC Visual Clarity)
- **Nguyên tắc "Thấy nhưng biết lý do khóa" (Explainable Disabled State)**:
  - Tuyệt đối không ẩn hoàn toàn nút chức năng trọng yếu (tránh hiểu lầm app bị lỗi tính năng) và không để nút active rồi bấm vào mới ném lỗi 403 Forbidden (gây ức chế).
  - Các nút hành động vượt quyền (ví dụ: Công nhân bấm duyệt 6S Safety, hoặc Line Leader duyệt khu vực khác):
    - Hiển thị nút ở trạng thái `Disabled` mờ 40%, kèm icon ổ khóa nhỏ `🔒`.
    - Tooltip hoặc nhãn phụ hiển thị lý do ngắn gọn bằng 2 ngôn ngữ: `"Cần quyền Safety Officer / 需安全员权限"`.
    - Thao tác bấm vào nút disabled kích hoạt haptic nhẹ (`30ms`) và hiển thị thông điệp hướng dẫn cấp quyền tương ứng.

## 10. ĐÓNG GÓI, VẬN HÀNH & TRIỂN KHAI ENTERPRISE

### 10.1. Mạng & Chứng thực TLS (Bắt buộc HTTPS)
- **Điều kiện tiên quyết PWA/Hardware API**: Mobile browser (iOS Safari, Android Chrome) khóa toàn bộ Service Worker và Camera (`getUserMedia`) nếu không có ngữ cảnh bảo mật (`Secure Context - HTTPS`).
- **Triển khai TLS trong mạng LAN & Onboarding Thiết bị**:
  - Tích hợp Reverse Proxy Caddy / Traefik tự cấp phát TLS thông qua Internal Root CA của nhà máy, HOẶC domain nội bộ phân giải qua DNS LAN (ví dụ: `https://6s.factory.lan`) với chứng chỉ wildcard SSL.
  - **Root CA Onboarding Endpoint (`GET /cert/ca.crt`)**: Cung cấp endpoint tải chứng chỉ CA và trang giao diện hướng dẫn 3 bước cài đặt Trust Profile trên iOS / Android, đảm bảo Camera hoạt động mượt mà không bị trình duyệt chặn bảo mật.
  - File nhúng Go hỗ trợ cấu hình cờ `-tls-cert` và `-tls-key` để chạy TLS trực tiếp không cần reverse proxy nếu muốn tối giản.

### 10.2. Sao lưu Dữ liệu Tự động (PostgreSQL 18 Backup & Disaster Recovery)
- **Trạng thái hiện tại — chưa triển khai trong Go runtime**: Chưa có job thực thi `pg_dump`, copy backup NAS hoặc `rsync` ảnh. Các yêu cầu dưới đây là mục tiêu vận hành, không phải tính năng đang chạy.
- **Mục tiêu backup PostgreSQL 18** (RPO 6 giờ; không chạy WAL archiving/PITR ở quy mô 1 server nhà máy): Cron/sidecar vận hành chạy `pg_dump -Fc` tạo `./backups/6s_backup_YYYYMMDD_HH.dump`, sau đó copy sang NAS NFS/SMB.
- **Mục tiêu RPO bằng chứng ảnh**: `pg_dump` chỉ phủ metadata, ảnh là bằng chứng bắt buộc của mọi issue. Đồng bộ `./uploads/` lên NAS bằng `rsync -a` (delta) mỗi giờ.
- **Đã triển khai trong runtime**: dọn dẹp orphan uploads lúc 01:00 và dọn audit logs hằng tuần (`CLEANUP_AUDIT_LOGS` > 12 tháng) qua `internal/cron`; xem Mục 10.3.
- **Lưu trữ ảnh cũ (Cold Data Archival - Zero CPU Penalty)**: 
  - File JPEG vốn đã được nén lossy tại client; việc chạy gzip ngốn 100% CPU của VPS 1 core mà tỷ lệ nén thu được < 2%.
  - Thay vào đó: Tự động gom archive theo định dạng uncompressed `tar` hoặc di chuyển trực tiếp cây thư mục `./uploads/YYYY/MM` của các issue `CLOSED` > 6 tháng sang ổ lưu trữ thứ cấp/NAS mà không tốn CPU nén lại.

### 10.3. Đảm bảo Tiến trình Tác vụ (Cron Job Resilience)
- Khi Go server khởi động, kiểm tra bảng `cron_task_logs`:
  - Nếu mốc `last_run_at` của `OVERDUE_PENALTY_SCAN` cách hiện tại > 24 giờ (do server bảo trì hoặc mất điện đúng 00:00), hệ thống tự động kích hoạt tiến trình quét bù ngay lập tức cho các ngày bị lỡ (ghi nhận `penalty_date`), nhờ unique index `uq_score_logs_overdue` chống trùng lặp, sau đó ghi nhận vào `cron_task_logs` với status `SUCCESS`.

### 10.4. Cấu hình Binary & Tài nguyên
- **Go Binary đơn nhất:**
  - Sử dụng `//go:embed` nhúng toàn bộ build static của React PWA (`dist/`) vào binary thực thi.
  - Cấu hình qua File `.env` hoặc cờ khởi chạy CLI (`-port 8443`, `-db-dsn postgres://...`, `-data-dir ./data`) chỉ dùng cho thông số hạ tầng (port, TLS, DB DSN).
  - **Cấu hình nghiệp vụ & tích hợp (Active Directory, Điểm số, Vị trí):** Lưu trữ và quản lý trực tiếp trong PostgreSQL (`ad_configs`, `scoring_rules`, `locations`), quản trị viên thao tác bật/tắt và kiểm tra kết nối qua giao diện Web/API theo thời gian thực mà không cần restart service hay sửa file host.
  - Yêu cầu phần cứng máy chủ tối thiểu: 1 Core CPU, 1GB RAM, 20GB SSD.

---

## 11. MA TRẬN KIỂM THỬ VÀ CỔNG NGHIỆM THU (TEST IMPACT MATRIX & VERIFICATION)

Tuân thủ `.agent/rules/development-workflow.md` và `.agent/rules/testing-standards.md`:

| Chiều phân tích | Tình huống cần kiểm thử (Test Scenarios) | Kỳ vọng kiểm chứng |
|---|---|---|
| **Hành vi cốt lõi (Happy Path)** | Tạo issue mới kèm ảnh before, duyệt đạt (Close) cộng điểm, khắc phục (Resolve) chuyển status | HTTP 200/201, dữ liệu ghi vào PostgreSQL, Outbox notification ghi bản ghi PENDING |
| **Ranh giới & Dữ liệu rác (Input/Boundary)** | Upload file > 2MB (Ảnh); giả mạo đuôi `.jpg` nhưng content là shell/binary script; `client_uuid` sai định dạng UUID v4 | Trả về HTTP 413, HTTP 415 (Magic Bytes) hoặc HTTP 400 Bad Request; chặn path traversal |
| **Trạng thái & Đồng thời (Concurrency/State)** | Hai client cùng resolve một issue lúc offline hoặc sync bản nháp cũ `expected_version != version` | Trả về HTTP 409 Conflict (Strict Optimistic Locking); bảo vệ dữ liệu phiên bản trên server |
| **Phân quyền & Bảo mật (RBAC/Security)** | User thường/Line Leader cố tình gọi POST `/issues/{id}/close` cho issue 6S Safety; Gọi API Admin khi không có role ADMIN | Trả về HTTP 403 Forbidden; không làm thay đổi trạng thái issue hoặc bảng điểm |
| **Khả năng hồi phục (Failure & Recovery)** | Mất kết nối Internet khi gửi WeChat qua WxPusher; Server sập khi đang gửi thông báo; Quét phạt quá hạn chạy bù sau khi tắt máy | Outbox retry theo exponential backoff; Server khởi động quét bù `OVERDUE_PENALTY_SCAN` không phạt trùng nhờ `uq_score_logs_overdue`; worker chết giữa dispatch -> row `SENDING` được re-claim sau lease 120s (at-least-once) |
| **Tương thích ngoại tuyến (Offline Resilience)** | Token hết hạn (sau 3600s) khi ở ngoài vùng sóng Wi-Fi; Rớt mạng khi đang sync | Client duy trì Offline Grace Mode; bản ghi lưu IndexedDB tự động sync khi có mạng lại |
