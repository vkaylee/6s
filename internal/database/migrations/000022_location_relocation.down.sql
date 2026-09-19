-- BEGIN TEAM LOCATION TEMPORAL SECTION
-- The down migration is intended for a disposable database or an approved
-- restore window: it discards temporal history after the new writers stop.

ALTER TABLE team_locations
    DROP CONSTRAINT IF EXISTS team_locations_no_overlap;
ALTER TABLE team_locations
    DROP CONSTRAINT IF EXISTS team_locations_valid_period;

-- Preserve the pre-000022 current mapping shape by retaining exactly one
-- row per pair: the latest open/current period wins. Historical periods are
-- intentionally removed only during this explicit rollback.
DELETE FROM team_locations a
USING team_locations b
WHERE a.period_id < b.period_id
  AND a.team_id = b.team_id
  AND a.location_code = b.location_code;

ALTER TABLE team_locations
    DROP CONSTRAINT IF EXISTS team_locations_pkey;
ALTER TABLE team_locations
    DROP COLUMN IF EXISTS period_id;
ALTER TABLE team_locations
    DROP COLUMN IF EXISTS valid_from;
ALTER TABLE team_locations
    DROP COLUMN IF EXISTS valid_to;
ALTER TABLE team_locations
    ADD CONSTRAINT team_locations_pkey PRIMARY KEY (team_id, location_code);

DROP SEQUENCE IF EXISTS team_locations_period_id_seq;
DROP INDEX IF EXISTS idx_team_locations_period;

-- BEGIN ISSUE SNAPSHOT ROLLBACK SECTION (owned by issue snapshot implementation)
DROP INDEX IF EXISTS idx_issues_location_snapshot_recorded_at;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_location_snapshot_source_check;
ALTER TABLE issues
    DROP COLUMN IF EXISTS location_snapshot_recorded_at,
    DROP COLUMN IF EXISTS location_snapshot_source,
    DROP COLUMN IF EXISTS location_name_en_snapshot,
    DROP COLUMN IF EXISTS location_name_zh_snapshot,
    DROP COLUMN IF EXISTS location_name_vi_snapshot;
