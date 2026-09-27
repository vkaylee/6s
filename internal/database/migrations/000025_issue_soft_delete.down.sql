BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM issues WHERE deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'cannot roll back issue soft delete while deleted issues remain';
    END IF;
    IF EXISTS (SELECT 1 FROM notification_outbox WHERE status = 'CANCELLED') THEN
        RAISE EXCEPTION 'cannot roll back issue soft delete while cancelled outbox rows remain';
    END IF;
END $$;

DELETE FROM role_permissions WHERE permission_code IN ('issue:view_deleted', 'issue:delete', 'issue:restore');
DELETE FROM permissions WHERE code IN ('issue:view_deleted', 'issue:delete', 'issue:restore');
DROP INDEX IF EXISTS idx_issues_site_deleted_created;
DROP INDEX IF EXISTS idx_issues_deleted_at;
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_status_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_status_check CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED'));
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_delete_metadata_check;
ALTER TABLE issues
    DROP COLUMN IF EXISTS delete_reason,
    DROP COLUMN IF EXISTS deleted_by,
    DROP COLUMN IF EXISTS deleted_at;

COMMIT;
