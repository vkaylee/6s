-- PostgreSQL Schema for 6S System (from SPEC.md)

CREATE TABLE IF NOT EXISTS locations (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_vi VARCHAR(255) NOT NULL,
    name_zh VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_code_lower ON locations (LOWER(code));

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    auth_source VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    ad_dn VARCHAR(500) UNIQUE,
    pin_hash VARCHAR(255),
    badge_code VARCHAR(100) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(30) NOT NULL DEFAULT 'USER',
    assigned_location_code VARCHAR(50) REFERENCES locations(code),
    wx_uid VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    device_info VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_vi VARCHAR(255) NOT NULL,
    name_zh VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    category VARCHAR(10) NOT NULL,
    use_count INT NOT NULL DEFAULT 1,
    is_preset BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_code_lower ON tags (LOWER(code));

CREATE TABLE IF NOT EXISTS issues (
    id BIGSERIAL PRIMARY KEY,
    client_uuid UUID UNIQUE NOT NULL,
    version INT NOT NULL DEFAULT 1,
    creator_id BIGINT NOT NULL REFERENCES users(id),
    resolver_id BIGINT REFERENCES users(id),
    category VARCHAR(10) NOT NULL,
    cause_type VARCHAR(20) NOT NULL DEFAULT 'CONDITION',
    location_code VARCHAR(50) NOT NULL REFERENCES locations(code),
    description TEXT,
    reject_reason TEXT,
    photo_before VARCHAR(500) NOT NULL,
    photo_detail VARCHAR(500),
    photo_after VARCHAR(500),
    score_rating SMALLINT DEFAULT 3,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS issue_tags (
    issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    tag_code VARCHAR(50) NOT NULL REFERENCES tags(code) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, tag_code)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
    id BIGSERIAL PRIMARY KEY,
    issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 5,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cron_task_logs (
    id BIGSERIAL PRIMARY KEY,
    task_name VARCHAR(100) NOT NULL,
    last_run_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL,
    details TEXT
);

CREATE TABLE IF NOT EXISTS scoring_rules (
    id BIGSERIAL PRIMARY KEY,
    rule_key VARCHAR(100) UNIQUE NOT NULL,
    points INT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS score_logs (
    id BIGSERIAL PRIMARY KEY,
    issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL,
    target_id VARCHAR(100) NOT NULL,
    rule_key VARCHAR(100) NOT NULL,
    points INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    penalty_date DATE
);

CREATE TABLE IF NOT EXISTS system_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(100) NOT NULL,
    target_id VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ad_configs (
    id INT PRIMARY KEY CHECK (id = 1),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    server VARCHAR(255) NOT NULL DEFAULT '',
    port INT NOT NULL DEFAULT 636,
    use_tls BOOLEAN NOT NULL DEFAULT TRUE,
    skip_tls_verify BOOLEAN NOT NULL DEFAULT FALSE,
    base_dn VARCHAR(500) NOT NULL DEFAULT '',
    bind_dn VARCHAR(500) NOT NULL DEFAULT '',
    bind_password VARCHAR(500) NOT NULL DEFAULT '',
    user_filter VARCHAR(500) NOT NULL DEFAULT '(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=%s)(userPrincipalName=%s)))',
    group_admin_dn VARCHAR(500) NOT NULL DEFAULT '',
    group_safety_dn VARCHAR(500) NOT NULL DEFAULT '',
    group_leader_dn VARCHAR(500) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notification_configs (
    id INT PRIMARY KEY CHECK (id = 1),
    wxpusher_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    wxpusher_app_token VARCHAR(500) NOT NULL DEFAULT '',
    lan_webhook_url VARCHAR(500) NOT NULL DEFAULT '',
    public_base_url VARCHAR(255) NOT NULL DEFAULT 'https://6s.factory.lan',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_configs (
    id INT PRIMARY KEY CHECK (id = 1),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    base_url VARCHAR(500) NOT NULL DEFAULT '',
    api_key VARCHAR(500) NOT NULL DEFAULT '',
    default_model VARCHAR(100) NOT NULL DEFAULT '',
    model_translate VARCHAR(100) NOT NULL DEFAULT '',
    model_vision VARCHAR(100) NOT NULL DEFAULT '',
    model_summary VARCHAR(100) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by BIGINT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_client_uuid ON issues(client_uuid);
CREATE INDEX IF NOT EXISTS idx_issues_location_code ON issues(location_code);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_cause_type ON issues(cause_type);
CREATE INDEX IF NOT EXISTS idx_issues_composite ON issues(location_code, status, category);
CREATE INDEX IF NOT EXISTS idx_issue_tags_tag ON issue_tags(tag_code);
CREATE INDEX IF NOT EXISTS idx_tags_use_count ON tags(use_count DESC);
CREATE INDEX IF NOT EXISTS idx_score_logs_target ON score_logs(target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_score_logs_rule ON score_logs(rule_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_score_logs_overdue ON score_logs(issue_id, rule_key, penalty_date) WHERE penalty_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON notification_outbox(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_system_audit_target ON system_audit_logs(target_table, target_id, created_at);
