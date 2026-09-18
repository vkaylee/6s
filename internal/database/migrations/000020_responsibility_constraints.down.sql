DROP TRIGGER IF EXISTS issues_responsibility_site_trigger ON issues;
DROP FUNCTION IF EXISTS enforce_issue_responsibility_site();
DELETE FROM role_permissions WHERE permission_code IN ('issue:assign', 'issue:verify_cause', 'asset:manage');
DELETE FROM permissions WHERE code IN ('issue:assign', 'issue:verify_cause', 'asset:manage');
