DROP INDEX IF EXISTS idx_tags_merged_tag_code;
DROP INDEX IF EXISTS idx_tags_status_owner;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_status_check;
ALTER TABLE tags
    DROP COLUMN IF EXISTS merged_tag_code,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS status;
