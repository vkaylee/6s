ALTER TABLE tags
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS merged_tag_code VARCHAR(50) REFERENCES tags(code);

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_status_check;
ALTER TABLE tags ADD CONSTRAINT tags_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'MERGED'));

CREATE INDEX IF NOT EXISTS idx_tags_status_owner ON tags(status, created_by);
CREATE INDEX IF NOT EXISTS idx_tags_merged_tag_code ON tags(merged_tag_code) WHERE merged_tag_code IS NOT NULL;
