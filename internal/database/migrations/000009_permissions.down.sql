DELETE FROM role_permissions;
DELETE FROM permissions;
DROP INDEX IF EXISTS idx_role_permissions_permission;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
