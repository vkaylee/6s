CREATE TABLE IF NOT EXISTS assets (
    id BIGSERIAL PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES sites(id),
    location_code VARCHAR(50) NOT NULL REFERENCES locations(code),
    asset_code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(100),
    default_team_id BIGINT REFERENCES teams(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, asset_code)
);

CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location_code);
CREATE INDEX IF NOT EXISTS idx_assets_default_team ON assets(default_team_id);

ALTER TABLE issues ADD COLUMN IF NOT EXISTS asset_id BIGINT REFERENCES assets(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS cause_team_id BIGINT REFERENCES teams(id);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS cause_status VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_cause_status_check;
ALTER TABLE issues ADD CONSTRAINT issues_cause_status_check CHECK (cause_status IN ('UNVERIFIED', 'CONFIRMED', 'NOT_APPLICABLE'));

CREATE INDEX IF NOT EXISTS idx_issues_asset ON issues(asset_id);
CREATE INDEX IF NOT EXISTS idx_issues_cause_team ON issues(cause_team_id);
