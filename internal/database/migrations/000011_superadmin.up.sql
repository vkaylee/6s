ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER','LINE_LEADER','SAFETY_OFFICER','ADMIN','SUPERADMIN'));

ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN ('USER','LINE_LEADER','SAFETY_OFFICER','ADMIN','SUPERADMIN'));

UPDATE users
SET role = 'SUPERADMIN'
WHERE id = (SELECT MIN(id) FROM users WHERE role = 'ADMIN');

INSERT INTO role_permissions (role, permission_code)
SELECT 'SUPERADMIN', code FROM permissions
ON CONFLICT (role, permission_code) DO NOTHING;
