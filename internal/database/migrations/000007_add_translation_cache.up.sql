CREATE TABLE IF NOT EXISTS translation_cache (
    content_hash VARCHAR(64) NOT NULL,
    target_lang VARCHAR(10) NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (content_hash, target_lang)
);
