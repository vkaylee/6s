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
