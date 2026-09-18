-- Cross-site integrity for responsibility references. Asset location is intentionally not checked:
-- issue.location_code records discovery history and assets may move later.
CREATE OR REPLACE FUNCTION enforce_issue_responsibility_site() RETURNS trigger AS $$
BEGIN
    IF NEW.cause_team_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM teams t WHERE t.id = NEW.cause_team_id AND t.site_id = NEW.site_id
    ) THEN
        RAISE EXCEPTION 'issue cause team must belong to issue site';
    END IF;
    IF NEW.asset_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM assets a WHERE a.id = NEW.asset_id AND a.site_id = NEW.site_id
    ) THEN
        RAISE EXCEPTION 'issue asset must belong to issue site';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS issues_responsibility_site_trigger ON issues;
CREATE TRIGGER issues_responsibility_site_trigger
BEFORE INSERT OR UPDATE OF site_id, asset_id, cause_team_id ON issues
FOR EACH ROW EXECUTE FUNCTION enforce_issue_responsibility_site();

INSERT INTO permissions (code, description, is_system) VALUES
('issue:assign', 'Assign issue team and user', TRUE),
('issue:verify_cause', 'Verify issue cause responsibility', TRUE),
('asset:manage', 'Manage site assets', TRUE)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, is_system = EXCLUDED.is_system;
INSERT INTO role_permissions (role, permission_code) VALUES
('SAFETY_OFFICER', 'issue:assign'), ('ADMIN', 'issue:assign'), ('SUPERADMIN', 'issue:assign'),
('SAFETY_OFFICER', 'issue:verify_cause'), ('ADMIN', 'issue:verify_cause'), ('SUPERADMIN', 'issue:verify_cause'),
('ADMIN', 'asset:manage'), ('SUPERADMIN', 'asset:manage')
ON CONFLICT (role, permission_code) DO NOTHING;
