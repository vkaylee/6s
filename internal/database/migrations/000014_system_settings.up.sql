CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY CHECK (id = 1),
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by BIGINT REFERENCES users(id)
);

INSERT INTO system_settings (id, timezone)
VALUES (1, 'Asia/Ho_Chi_Minh')
ON CONFLICT (id) DO NOTHING;
