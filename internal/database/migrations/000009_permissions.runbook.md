# Production runbook: migration 000009 permissions

Owner: backend/platform. Change window: deploy with the application version that uses `auth.HasPermission`.

## Preflight and backup

1. Confirm the database target, current migration state, application rollback point, and an operator-approved change window.
2. Take a consistent, restorable backup of the database. Record backup ID and restore validation result.
3. Confirm application instances are compatible with both pre-000009 role checks and the new `permissions`/`role_permissions` tables during rollout.

## Apply

Run the normal migration runner from the release containing `000009_permissions.up.sql`:

```sh
./leedevkit manage db:setup
```

The migration is idempotent (`IF NOT EXISTS`, `ON CONFLICT`). Do **not** run `000009_permissions.down.sql` in production; it is destructive and intended only for disposable or explicitly restore-approved environments.

## Reconciliation

Run against the production database after the migration and retain the output with the deployment record:

```sql
SELECT COUNT(*) AS permission_count FROM permissions;
SELECT COUNT(*) AS role_permission_count FROM role_permissions;
SELECT COUNT(*) AS orphan_count
FROM role_permissions rp
LEFT JOIN permissions p ON p.code = rp.permission_code
WHERE p.code IS NULL;
SELECT COUNT(*) AS duplicate_count
FROM (
  SELECT role, permission_code
  FROM role_permissions
  GROUP BY role, permission_code
  HAVING COUNT(*) > 1
) duplicates;
SELECT role, COUNT(*) AS permission_count
FROM role_permissions
GROUP BY role
ORDER BY role;
SELECT role, permission_code
FROM role_permissions
WHERE role = 'ADMIN'
  AND permission_code IN ('permission:manage', 'user:manage')
ORDER BY permission_code;
```

Expected results: `permission_count = 14`, `role_permission_count = 32`, `orphan_count = 0`, `duplicate_count = 0`; role counts `USER = 5`, `LINE_LEADER = 6`, `SAFETY_OFFICER = 7`, `ADMIN = 14`; ADMIN includes both `permission:manage` and `user:manage`.

## Failure and rollback

- If migration execution fails, stop rollout. Do not run the down migration. Resolve the SQL/data issue, then rerun the idempotent up migration or restore the pre-change backup.
- If reconciliation fails, keep traffic on the previous application behavior where possible, investigate the recorded counts, and roll forward with a corrected idempotent migration. Restore the verified backup only when roll-forward is unsafe or data integrity is at risk.
- After reconciliation passes, deploy the permission-enforcing application and smoke-test a USER, LINE_LEADER, SAFETY_OFFICER, and ADMIN action matrix. Monitor authorization failures and database errors.

## Version tracking and operator rollback

The runner creates `schema_migrations` and records each migration version, filename, SHA-256 checksum, and commit time. It holds a PostgreSQL advisory lock, applies pending migrations numerically, and commits each SQL file with its tracking row. Restarting is safe: recorded versions are skipped; edited applied assets fail with a checksum mismatch.

Never delete rows from `schema_migrations` or run a down migration as a routine rollback. Down scripts can destroy data and are for disposable databases or an explicitly approved restore procedure. For an application rollback, deploy the prior compatible binary while retaining the schema. For a failed migration, the transaction is rolled back and the failed version remains unrecorded; fix forward with a new migration. If a non-transactional PostgreSQL operation or integrity risk prevents fix-forward, stop traffic and restore the verified pre-deploy backup, then verify `schema_migrations` and application compatibility before restart.
