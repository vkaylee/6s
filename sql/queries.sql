-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 LIMIT 1;

-- name: GetUserByUsername :one
SELECT * FROM users
WHERE username = $1 LIMIT 1;

-- name: ListLocations :many
SELECT * FROM locations
WHERE is_active = TRUE
ORDER BY code ASC;

-- name: GetLocationByCode :one
SELECT * FROM locations
WHERE code = $1 LIMIT 1;

-- name: GetIssueByUUID :one
SELECT * FROM issues
WHERE client_uuid = $1 LIMIT 1;

-- name: ListOpenIssues :many
SELECT * FROM issues
WHERE status = 'OPEN'
ORDER BY created_at DESC;
