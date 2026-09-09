INSERT INTO permissions (code, description, is_system) VALUES
('reports:view', 'View reports and exports', TRUE),
('settings:manage', 'Manage system settings', TRUE)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, is_system = EXCLUDED.is_system;

INSERT INTO role_permissions (role, permission_code) VALUES
('LINE_LEADER', 'reports:view'),
('SAFETY_OFFICER', 'reports:view'),
('ADMIN', 'reports:view'),
('ADMIN', 'settings:manage'),
('SUPERADMIN', 'reports:view'),
('SUPERADMIN', 'settings:manage')
ON CONFLICT (role, permission_code) DO NOTHING;
