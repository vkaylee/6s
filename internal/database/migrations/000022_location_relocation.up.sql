-- Temporal team-location mapping.
-- Existing rows are backfilled at one explicit cutover instant (the migration
-- transaction timestamp). This records when the temporal model became active;
-- it does not invent an earlier responsibility start time.

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE team_locations
    ADD COLUMN IF NOT EXISTS period_id BIGINT,
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;

CREATE SEQUENCE IF NOT EXISTS team_locations_period_id_seq;
ALTER SEQUENCE team_locations_period_id_seq OWNED BY team_locations.period_id;

-- Safe, restartable backfill: only rows missing the new values are populated.
-- CURRENT_TIMESTAMP is stable for this migration transaction and is the cutover.
UPDATE team_locations
SET valid_from = CURRENT_TIMESTAMP
WHERE valid_from IS NULL;

UPDATE team_locations
SET period_id = nextval('team_locations_period_id_seq')
WHERE period_id IS NULL;

SELECT setval(
    'team_locations_period_id_seq',
    GREATEST(COALESCE((SELECT MAX(period_id) FROM team_locations), 1), 1),
    TRUE
);

ALTER TABLE team_locations
    ALTER COLUMN period_id SET DEFAULT nextval('team_locations_period_id_seq'),
    ALTER COLUMN period_id SET NOT NULL,
    ALTER COLUMN valid_from SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN valid_from SET NOT NULL;

ALTER TABLE team_locations
    DROP CONSTRAINT IF EXISTS team_locations_pkey;
ALTER TABLE team_locations
    ADD CONSTRAINT team_locations_pkey PRIMARY KEY (period_id);
ALTER TABLE team_locations
    DROP CONSTRAINT IF EXISTS team_locations_valid_period;
ALTER TABLE team_locations
    ADD CONSTRAINT team_locations_valid_period
    CHECK (valid_to IS NULL OR valid_to > valid_from);
ALTER TABLE team_locations
    DROP CONSTRAINT IF EXISTS team_locations_no_overlap;
ALTER TABLE team_locations
    ADD CONSTRAINT team_locations_no_overlap
    EXCLUDE USING gist (
        team_id WITH =,
        location_code WITH =,
        tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz), '[)') WITH &&
    );

CREATE INDEX IF NOT EXISTS idx_team_locations_period
    ON team_locations(team_id, location_code, valid_from, valid_to);

-- Existing cross-site trigger from migration 000016 remains in force.
-- Issue snapshot columns are appended below this marker by the issue snapshot owner.
-- BEGIN ISSUE SNAPSHOT SECTION (owned by issue snapshot implementation)

-- Immutable-at-create display provenance for issue location names. The location
-- code remains the authoritative foreign key and is always validated server-side.
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS location_name_vi_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS location_name_zh_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS location_name_en_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS location_snapshot_source VARCHAR(32),
    ADD COLUMN IF NOT EXISTS location_snapshot_recorded_at TIMESTAMPTZ;

ALTER TABLE issues
    ADD CONSTRAINT issues_location_snapshot_source_check
    CHECK (location_snapshot_source IS NULL OR location_snapshot_source IN ('SERVER_CAPTURE', 'CLIENT_CAPTURE'));

CREATE INDEX IF NOT EXISTS idx_issues_location_snapshot_recorded_at
    ON issues(location_snapshot_recorded_at);
