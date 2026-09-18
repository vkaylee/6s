-- Migration: 000021_remove_asset_manage_permission.down.sql
INSERT INTO permissions (code, description, is_system) VALUES
('asset:manage', 'Manage site assets', TRUE)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, is_system = EXCLUDED.is_system;
INSERT INTO role_permissions (role, permission_code) VALUES
('ADMIN', 'asset:manage'), ('SUPERADMIN', 'asset:manage')
ON CONFLICT (role, permission_code) DO NOTHING;
