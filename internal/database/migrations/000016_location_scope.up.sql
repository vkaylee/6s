-- Location & Team scope mapping for multi-location management and enterprise boundaries.

CREATE TABLE IF NOT EXISTS location_memberships (
    location_code VARCHAR(50) NOT NULL REFERENCES locations(code) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    responsibility_type VARCHAR(20) NOT NULL DEFAULT 'OWNER' CHECK (responsibility_type IN ('OWNER', 'BACKUP', 'REVIEWER')),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMPTZ NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (location_code, user_id),
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_location_memberships_user ON location_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_location_memberships_location ON location_memberships(location_code);

CREATE TABLE IF NOT EXISTS team_locations (
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    location_code VARCHAR(50) NOT NULL REFERENCES locations(code) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (team_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_team_locations_team ON team_locations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_locations_location ON team_locations(location_code);

-- Cross-site enforcement triggers
CREATE OR REPLACE FUNCTION enforce_location_membership_site() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users u
        JOIN locations l ON l.code = NEW.location_code
        WHERE u.id = NEW.user_id AND u.site_id = l.site_id
    ) THEN
        RAISE EXCEPTION 'user and location must belong to the same site';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS location_memberships_site_trigger ON location_memberships;
CREATE TRIGGER location_memberships_site_trigger
BEFORE INSERT OR UPDATE OF location_code, user_id ON location_memberships
FOR EACH ROW EXECUTE FUNCTION enforce_location_membership_site();

CREATE OR REPLACE FUNCTION enforce_team_location_site() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM teams t
        JOIN locations l ON l.code = NEW.location_code
        WHERE t.id = NEW.team_id AND t.site_id = l.site_id
    ) THEN
        RAISE EXCEPTION 'team and location must belong to the same site';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_locations_site_trigger ON team_locations;
CREATE TRIGGER team_locations_site_trigger
BEFORE INSERT OR UPDATE OF location_code, team_id ON team_locations
FOR EACH ROW EXECUTE FUNCTION enforce_team_location_site();

-- Backfill from users.assigned_location_code
INSERT INTO location_memberships (location_code, user_id, responsibility_type, is_active)
SELECT u.assigned_location_code, u.id, 'OWNER', TRUE
FROM users u
JOIN locations l ON l.code = u.assigned_location_code AND l.site_id = u.site_id
WHERE u.assigned_location_code IS NOT NULL AND u.is_active = TRUE
ON CONFLICT (location_code, user_id) DO NOTHING;
