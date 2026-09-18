DROP INDEX IF EXISTS idx_issues_cause_team;
DROP INDEX IF EXISTS idx_issues_asset;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_cause_status_check;
ALTER TABLE issues DROP COLUMN IF EXISTS cause_status;
ALTER TABLE issues DROP COLUMN IF EXISTS cause_team_id;
ALTER TABLE issues DROP COLUMN IF EXISTS asset_id;
DROP INDEX IF EXISTS idx_assets_default_team;
DROP INDEX IF EXISTS idx_assets_location;
DROP TABLE IF EXISTS assets;
