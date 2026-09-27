ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS delete_reason TEXT;

ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_delete_metadata_check;
ALTER TABLE issues ADD CONSTRAINT issues_delete_metadata_check CHECK (
    (deleted_at IS NULL AND deleted_by IS NULL AND delete_reason IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND delete_reason IS NOT NULL AND char_length(delete_reason) BETWEEN 1 AND 1000)
);

ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_status_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_status_check
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_issues_deleted_at ON issues(deleted_at);
CREATE INDEX IF NOT EXISTS idx_issues_site_deleted_created ON issues(site_id, deleted_at, created_at DESC);

INSERT INTO permissions (code, description, is_system) VALUES
    ('issue:view_deleted', 'View soft-deleted issues', TRUE),
    ('issue:delete', 'Soft-delete issues', TRUE),
    ('issue:restore', 'Restore soft-deleted issues', TRUE)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, is_system = EXCLUDED.is_system;

INSERT INTO role_permissions (role, permission_code) VALUES
    ('ADMIN', 'issue:view_deleted'), ('ADMIN', 'issue:delete'), ('ADMIN', 'issue:restore'),
    ('SUPERADMIN', 'issue:view_deleted'), ('SUPERADMIN', 'issue:delete'), ('SUPERADMIN', 'issue:restore')
ON CONFLICT (role, permission_code) DO NOTHING;
