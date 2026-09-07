CREATE TABLE IF NOT EXISTS permissions (
    code VARCHAR(100) PRIMARY KEY,
    description TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(30) NOT NULL CHECK (role IN ('USER','LINE_LEADER','SAFETY_OFFICER','ADMIN')),
    permission_code VARCHAR(100) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_code);

INSERT INTO permissions (code, description, is_system) VALUES
('issue:create', 'Create issues', TRUE),
('issue:view_all', 'View all issues', TRUE),
('issue:resolve', 'Upload after photo and resolve issues', TRUE),
('issue:close_own', 'Close own issues', TRUE),
('issue:close_line', 'Close issues on assigned line', TRUE),
('issue:close_any', 'Close any issue', TRUE),
('issue:close_safety', 'Close safety issues', TRUE),
('issue:reopen', 'Reopen issues', TRUE),
('issue:invalidate', 'Invalidate issues', TRUE),
('scoring:manage', 'Manage scoring rules and retroactive scores', TRUE),
('ad:manage', 'Manage Active Directory configuration', TRUE),
('user:manage', 'Manage users, roles, locations and active status', TRUE),
('permission:manage', 'Manage role permissions', TRUE),
('masterdata:manage', 'Manage locations and tags', TRUE)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, is_system = EXCLUDED.is_system;

INSERT INTO role_permissions (role, permission_code) VALUES
('USER', 'issue:create'),
('USER', 'issue:view_all'),
('USER', 'issue:resolve'),
('USER', 'issue:close_own'),
('USER', 'issue:reopen'),
('LINE_LEADER', 'issue:create'),
('LINE_LEADER', 'issue:view_all'),
('LINE_LEADER', 'issue:resolve'),
('LINE_LEADER', 'issue:close_own'),
('LINE_LEADER', 'issue:close_line'),
('LINE_LEADER', 'issue:reopen'),
('SAFETY_OFFICER', 'issue:create'),
('SAFETY_OFFICER', 'issue:view_all'),
('SAFETY_OFFICER', 'issue:resolve'),
('SAFETY_OFFICER', 'issue:close_any'),
('SAFETY_OFFICER', 'issue:close_safety'),
('SAFETY_OFFICER', 'issue:reopen'),
('SAFETY_OFFICER', 'issue:invalidate'),
('ADMIN', 'issue:create'),
('ADMIN', 'issue:view_all'),
('ADMIN', 'issue:resolve'),
('ADMIN', 'issue:close_own'),
('ADMIN', 'issue:close_line'),
('ADMIN', 'issue:close_any'),
('ADMIN', 'issue:close_safety'),
('ADMIN', 'issue:reopen'),
('ADMIN', 'issue:invalidate'),
('ADMIN', 'scoring:manage'),
('ADMIN', 'ad:manage'),
('ADMIN', 'user:manage'),
('ADMIN', 'permission:manage'),
('ADMIN', 'masterdata:manage')
ON CONFLICT (role, permission_code) DO NOTHING;
