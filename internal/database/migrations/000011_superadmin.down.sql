-- Dev-only rollback. Production rollback uses restore or roll-forward.
DELETE FROM role_permissions WHERE role = 'SUPERADMIN';
UPDATE users SET role = 'ADMIN' WHERE role = 'SUPERADMIN';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER','LINE_LEADER','SAFETY_OFFICER','ADMIN'));
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN ('USER','LINE_LEADER','SAFETY_OFFICER','ADMIN'));
