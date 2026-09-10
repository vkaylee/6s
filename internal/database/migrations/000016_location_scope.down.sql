DROP TRIGGER IF EXISTS team_locations_site_trigger ON team_locations;
DROP FUNCTION IF EXISTS enforce_team_location_site();

DROP TRIGGER IF EXISTS location_memberships_site_trigger ON location_memberships;
DROP FUNCTION IF EXISTS enforce_location_membership_site();

DROP TABLE IF EXISTS team_locations;
DROP TABLE IF EXISTS location_memberships;
