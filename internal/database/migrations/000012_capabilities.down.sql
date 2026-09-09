DELETE FROM role_permissions WHERE permission_code IN ('reports:view', 'settings:manage');
DELETE FROM permissions WHERE code IN ('reports:view', 'settings:manage');
