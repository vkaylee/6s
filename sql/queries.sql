-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 LIMIT 1;

-- name: GetUserByUsername :one
SELECT * FROM users
WHERE username = $1 LIMIT 1;

-- name: GetUserByBadgeCode :one
SELECT * FROM users
WHERE badge_code = $1 LIMIT 1;

-- name: UpdateUserLastLogin :exec
UPDATE users
SET last_login_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: CreateUserJIT :one
INSERT INTO users (
    username, auth_source, ad_dn, full_name, email, role, is_active, last_login_at
) VALUES (
    $1, 'AD', $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP
)
RETURNING *;

-- name: UpdateUserADLogin :one
UPDATE users
SET full_name = $2,
    email = $3,
    role = $4,
    last_login_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: UpdateUserAdmin :one
UPDATE users
SET role = COALESCE($2, role),
    assigned_location_code = COALESCE($3, assigned_location_code),
    is_active = COALESCE($4, is_active)
WHERE id = $1
RETURNING *;

-- name: ListUsers :many
SELECT * FROM users
WHERE ($1::varchar IS NULL OR assigned_location_code = $1)
  AND ($2::boolean IS NULL OR is_active = $2)
ORDER BY id ASC;

-- name: CreateRefreshToken :one
INSERT INTO refresh_tokens (
    user_id, token_hash, device_info, expires_at
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: GetRefreshTokenByHash :one
SELECT * FROM refresh_tokens
WHERE token_hash = $1
  AND revoked_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP
LIMIT 1;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: RevokeUserRefreshTokens :exec
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: ListUserActiveSessions :many
SELECT id, device_info, created_at, expires_at
FROM refresh_tokens
WHERE user_id = $1
  AND revoked_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP
ORDER BY created_at DESC;

-- name: GetADConfig :one
SELECT * FROM ad_configs
WHERE id = 1 LIMIT 1;

-- name: UpsertADConfig :one
INSERT INTO ad_configs (
    id, is_enabled, server, port, use_tls, skip_tls_verify,
    base_dn, bind_dn, bind_password, user_filter,
    group_admin_dn, group_safety_dn, group_leader_dn,
    updated_at, updated_by
) VALUES (
    1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, $13
)
ON CONFLICT (id) DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    server = EXCLUDED.server,
    port = EXCLUDED.port,
    use_tls = EXCLUDED.use_tls,
    skip_tls_verify = EXCLUDED.skip_tls_verify,
    base_dn = EXCLUDED.base_dn,
    bind_dn = EXCLUDED.bind_dn,
    bind_password = CASE WHEN EXCLUDED.bind_password = '' THEN ad_configs.bind_password ELSE EXCLUDED.bind_password END,
    user_filter = EXCLUDED.user_filter,
    group_admin_dn = EXCLUDED.group_admin_dn,
    group_safety_dn = EXCLUDED.group_safety_dn,
    group_leader_dn = EXCLUDED.group_leader_dn,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = EXCLUDED.updated_by
RETURNING *;

-- name: InsertAuditLog :exec
INSERT INTO system_audit_logs (
    user_id, action, target_table, target_id, old_value, new_value, ip_address, user_agent, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP
);

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
