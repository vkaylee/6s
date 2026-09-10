INSERT INTO permissions (code, description, is_system) VALUES
('reports:export', 'Export reports and issues data', TRUE)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, is_system = EXCLUDED.is_system;

INSERT INTO role_permissions (role, permission_code) VALUES
('LINE_LEADER', 'reports:export'),
('SAFETY_OFFICER', 'reports:export'),
('ADMIN', 'reports:export'),
('SUPERADMIN', 'reports:export')
ON CONFLICT (role, permission_code) DO NOTHING;
