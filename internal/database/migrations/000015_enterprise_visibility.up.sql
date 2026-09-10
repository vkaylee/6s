-- Enterprise issue visibility and assignment boundaries.
-- Legacy rows are placed in one governed site; 6S rows remain restricted.
CREATE TABLE IF NOT EXISTS sites (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sites (code, name)
VALUES ('DEFAULT', 'Default Site')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS site_id BIGINT;
UPDATE locations SET site_id = (SELECT id FROM sites WHERE code = 'DEFAULT') WHERE site_id IS NULL;
ALTER TABLE locations ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_site_id_fkey;
ALTER TABLE locations ADD CONSTRAINT locations_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id);
CREATE INDEX IF NOT EXISTS idx_locations_site ON locations(site_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS site_id BIGINT;
UPDATE users SET site_id = (SELECT id FROM sites WHERE code = 'DEFAULT') WHERE site_id IS NULL;
ALTER TABLE users ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_site_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id);
CREATE INDEX IF NOT EXISTS idx_users_site ON users(site_id);

CREATE TABLE IF NOT EXISTS teams (
    id BIGSERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES sites(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, code)
);
CREATE INDEX IF NOT EXISTS idx_teams_site ON teams(site_id);

CREATE TABLE IF NOT EXISTS team_memberships (
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships(user_id);

ALTER TABLE issues ADD COLUMN IF NOT EXISTS site_id BIGINT;
UPDATE issues SET site_id = COALESCE(
    (SELECT u.site_id FROM users u WHERE u.id = issues.creator_id),
    (SELECT id FROM sites WHERE code = 'DEFAULT')
) WHERE site_id IS NULL;
ALTER TABLE issues ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS assignee_id BIGINT REFERENCES users(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS assigned_team_id BIGINT REFERENCES teams(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS visibility_class VARCHAR(30);
UPDATE issues SET visibility_class = CASE WHEN category = '6S' THEN 'SAFETY_RESTRICTED' ELSE 'SITE_PUBLIC' END WHERE visibility_class IS NULL;
ALTER TABLE issues ALTER COLUMN visibility_class SET DEFAULT 'SITE_PUBLIC';
ALTER TABLE issues ALTER COLUMN visibility_class SET NOT NULL;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_site_id_fkey;
ALTER TABLE issues ADD CONSTRAINT issues_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id);
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_visibility_class_check;
ALTER TABLE issues ADD CONSTRAINT issues_visibility_class_check CHECK (visibility_class IN ('SITE_PUBLIC', 'SAFETY_RESTRICTED'));
CREATE INDEX IF NOT EXISTS idx_issues_site_visibility ON issues(site_id, visibility_class, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_assigned_team ON issues(assigned_team_id);

-- Prevent assignment references from crossing a site boundary.
CREATE OR REPLACE FUNCTION enforce_issue_site_assignments() RETURNS trigger AS $$
BEGIN
    IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = NEW.assignee_id AND u.site_id = NEW.site_id
    ) THEN
        RAISE EXCEPTION 'issue assignee must belong to issue site';
    END IF;
    IF NEW.assigned_team_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM teams t WHERE t.id = NEW.assigned_team_id AND t.site_id = NEW.site_id
    ) THEN
        RAISE EXCEPTION 'issue team must belong to issue site';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS issues_site_assignments_trigger ON issues;
CREATE TRIGGER issues_site_assignments_trigger
BEFORE INSERT OR UPDATE OF site_id, assignee_id, assigned_team_id ON issues
FOR EACH ROW EXECUTE FUNCTION enforce_issue_site_assignments();
