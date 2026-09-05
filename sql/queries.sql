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
WHERE (sqlc.narg('assigned_location_code')::varchar IS NULL OR assigned_location_code = sqlc.narg('assigned_location_code'))
  AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
ORDER BY id ASC;

-- name: CountAdmins :one
SELECT COUNT(*) FROM users
WHERE role = 'ADMIN' AND is_active = TRUE;

-- name: CreateLocalAdmin :one
INSERT INTO users (
    username, password_hash, auth_source, full_name, email, role, is_active
) VALUES (
    $1, $2, 'LOCAL', $3, $4, 'ADMIN', TRUE
)
RETURNING *;

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

-- name: CreateLocation :one
INSERT INTO locations (
    code, name_vi, name_zh, name_en, qr_code, is_active
) VALUES (
    $1, $2, $3, $4, $5, TRUE
)
RETURNING *;

-- name: ListAllLocations :many
-- Returns all locations including inactive ones for admin management
SELECT * FROM locations
ORDER BY code ASC;

-- name: UpdateLocationActiveStatus :one
UPDATE locations
SET is_active = $2
WHERE code = $1
RETURNING *;

-- name: ListTags :many
SELECT * FROM tags
WHERE is_active = TRUE
ORDER BY use_count DESC, id ASC;

-- name: ListAllTags :many
SELECT * FROM tags
ORDER BY use_count DESC, id ASC;

-- name: UpdateTagActiveStatus :one
UPDATE tags
SET is_active = $2
WHERE code = $1
RETURNING *;

-- name: SetAllTagsActiveStatus :exec
UPDATE tags
SET is_active = $1;

-- name: UpsertTag :one
INSERT INTO tags (
    code, name_vi, name_zh, name_en, category, is_preset
) VALUES (
    $1, $2, $3, $4, $5, $6
)
ON CONFLICT (code) DO UPDATE SET
    name_vi = EXCLUDED.name_vi,
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category
RETURNING *;

-- name: IncrementTagUseCount :exec
UPDATE tags
SET use_count = use_count + 1
WHERE code = $1;

-- name: GetIssueByUUID :one
SELECT * FROM issues
WHERE client_uuid = $1 LIMIT 1;

-- name: GetIssueByID :one
SELECT * FROM issues
WHERE id = $1 LIMIT 1;

-- name: CreateIssue :one
INSERT INTO issues (
    client_uuid, version, creator_id, category, location_code, description, photo_before, photo_detail, status
) VALUES (
    $1, 1, $2, $3, $4, $5, $6, $7, 'OPEN'
)
RETURNING *;

-- name: InsertIssueTag :exec
INSERT INTO issue_tags (
    issue_id, tag_code
) VALUES (
    $1, $2
) ON CONFLICT DO NOTHING;

-- name: ListTagsForIssue :many
SELECT t.code, t.name_vi, t.name_zh, t.name_en, t.category
FROM tags t
JOIN issue_tags it ON t.code = it.tag_code
WHERE it.issue_id = $1;

-- name: DeleteIssueTags :exec
DELETE FROM issue_tags
WHERE issue_id = $1;

-- name: ListIssuesFiltered :many
SELECT i.*, 
       loc.name_vi AS location_name_vi,
       u.username AS creator_username,
       u.full_name AS creator_full_name,
       res.username AS resolver_username,
       res.full_name AS resolver_full_name
FROM issues i
JOIN locations loc ON i.location_code = loc.code
JOIN users u ON i.creator_id = u.id
LEFT JOIN users res ON i.resolver_id = res.id
WHERE (sqlc.narg('status')::varchar IS NULL OR i.status = sqlc.narg('status'))
  AND (sqlc.narg('category')::varchar IS NULL OR i.category = sqlc.narg('category'))
  AND (sqlc.narg('location_code')::varchar IS NULL OR i.location_code = sqlc.narg('location_code'))
ORDER BY 
    CASE WHEN i.category = '6S' THEN 0 ELSE 1 END,
    i.created_at DESC
LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: CountIssuesFiltered :one
SELECT COUNT(*) FROM issues
WHERE (sqlc.narg('status')::varchar IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('category')::varchar IS NULL OR category = sqlc.narg('category'))
  AND (sqlc.narg('location_code')::varchar IS NULL OR location_code = sqlc.narg('location_code'));

-- name: ResolveIssue :one
UPDATE issues
SET status = 'PENDING_REVIEW',
    resolver_id = $2,
    photo_after = $3,
    resolved_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE id = $1 AND status = 'OPEN' AND version = $4
RETURNING *;

-- name: ForceResolveIssue :one
UPDATE issues
SET status = 'PENDING_REVIEW',
    resolver_id = $2,
    photo_after = $3,
    resolved_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE id = $1
RETURNING *;

-- name: CloseIssue :one
UPDATE issues
SET status = 'CLOSED',
    score_rating = $2,
    closed_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE id = $1 
  AND status = 'PENDING_REVIEW' 
  AND (sqlc.narg('expected_version')::int IS NULL OR version = sqlc.narg('expected_version'))
RETURNING *;

-- name: ReopenIssue :one
UPDATE issues
SET status = 'OPEN',
    reject_reason = $2,
    version = version + 1
WHERE id = $1 
  AND status = 'PENDING_REVIEW' 
  AND (sqlc.narg('expected_version')::int IS NULL OR version = sqlc.narg('expected_version'))
RETURNING *;

-- name: InvalidateIssue :one
UPDATE issues
SET status = 'INVALID',
    reject_reason = $2,
    version = version + 1
WHERE id = $1 
  AND status IN ('OPEN', 'PENDING_REVIEW') 
  AND (sqlc.narg('expected_version')::int IS NULL OR version = sqlc.narg('expected_version'))
RETURNING *;

-- name: PatchIssue :one
UPDATE issues
SET category = COALESCE(sqlc.narg('category'), category),
    location_code = COALESCE(sqlc.narg('location_code'), location_code),
    version = version + 1
WHERE id = $1
RETURNING *;

-- name: CreateOutboxEntry :one
INSERT INTO notification_outbox (
    issue_id, event_type, channel, payload, status, next_retry_at
) VALUES (
    $1, $2, $3, $4, 'PENDING', CURRENT_TIMESTAMP
)
RETURNING *;

-- name: InsertScoreLog :exec
INSERT INTO score_logs (
    issue_id, target_type, target_id, rule_key, points, created_at, penalty_date
) VALUES (
    $1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6
);

-- name: GetScoringRules :many
SELECT * FROM scoring_rules
ORDER BY id ASC;

-- name: GetScoringRuleByKey :one
SELECT * FROM scoring_rules
WHERE rule_key = $1 LIMIT 1;

-- name: UpsertScoringRule :one
INSERT INTO scoring_rules (
    rule_key, points, description
) VALUES (
    $1, $2, $3
)
ON CONFLICT (rule_key) DO UPDATE SET
    points = EXCLUDED.points,
    description = COALESCE(EXCLUDED.description, scoring_rules.description)
RETURNING *;

-- name: GetLocationScoreSumInWeek :one
SELECT COALESCE(SUM(points), 0)::bigint AS sum_points
FROM score_logs
WHERE target_type = 'LOCATION'
  AND target_id = $1
  AND created_at >= $2;

-- name: CountOpenIssuesByLocation :one
SELECT COUNT(*)::bigint AS open_count
FROM issues
WHERE location_code = $1
  AND status = 'OPEN';

-- name: CountOverdueIssuesByLocation :one
SELECT COUNT(*)::bigint AS overdue_count
FROM issues
WHERE location_code = $1
  AND status = 'OPEN'
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours';

-- name: GetReporterLeaderboardInMonth :many
SELECT u.id AS user_id,
       u.full_name,
       COALESCE(SUM(sl.points), 0)::bigint AS points,
       COUNT(DISTINCT CASE WHEN i.status = 'CLOSED' THEN i.id END)::bigint AS valid_count,
       COUNT(DISTINCT CASE WHEN i.status = 'CLOSED' AND i.category = '6S' THEN i.id END)::bigint AS safety_count
FROM users u
JOIN score_logs sl ON sl.target_type = 'USER' AND sl.target_id = u.id::varchar
LEFT JOIN issues i ON i.id = sl.issue_id
WHERE sl.created_at >= $1
GROUP BY u.id, u.full_name
ORDER BY points DESC, valid_count DESC, u.id ASC
LIMIT 50;

-- name: ListScoreLogsSince :many
SELECT * FROM score_logs
WHERE created_at >= $1
ORDER BY id ASC;

-- name: GetNotificationConfig :one
SELECT * FROM notification_configs
WHERE id = 1 LIMIT 1;

-- name: UpsertNotificationConfig :one
INSERT INTO notification_configs (
    id, wxpusher_enabled, wxpusher_app_token, lan_webhook_url, public_base_url, updated_at, updated_by
) VALUES (
    1, $1, $2, $3, $4, CURRENT_TIMESTAMP, $5
)
ON CONFLICT (id) DO UPDATE SET
    wxpusher_enabled = EXCLUDED.wxpusher_enabled,
    wxpusher_app_token = CASE WHEN EXCLUDED.wxpusher_app_token = '' THEN notification_configs.wxpusher_app_token ELSE EXCLUDED.wxpusher_app_token END,
    lan_webhook_url = CASE WHEN EXCLUDED.lan_webhook_url = '' THEN notification_configs.lan_webhook_url ELSE EXCLUDED.lan_webhook_url END,
    public_base_url = EXCLUDED.public_base_url,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = EXCLUDED.updated_by
RETURNING *;

-- name: ClaimOutboxTasks :many
UPDATE notification_outbox
SET status = 'SENDING',
    next_retry_at = CURRENT_TIMESTAMP + INTERVAL '120 seconds'
WHERE id IN (
    SELECT id FROM notification_outbox
    WHERE (status = 'PENDING' AND next_retry_at <= CURRENT_TIMESTAMP)
       OR (status = 'SENDING' AND next_retry_at < CURRENT_TIMESTAMP)
    ORDER BY id ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: MarkOutboxSent :exec
UPDATE notification_outbox
SET status = 'SENT',
    sent_at = CURRENT_TIMESTAMP
WHERE id = $1 AND status = 'SENDING';

-- name: MarkOutboxFailed :exec
UPDATE notification_outbox
SET status = 'FAILED',
    last_error = $1
WHERE id = $2 AND status = 'SENDING';

-- name: RetryOutboxTask :exec
UPDATE notification_outbox
SET status = 'PENDING',
    retry_count = retry_count + 1,
    last_error = $1,
    next_retry_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second')
WHERE id = $3 AND status = 'SENDING';

-- name: GetLastCronTaskLog :one
SELECT * FROM cron_task_logs
WHERE task_name = $1
ORDER BY last_run_at DESC
LIMIT 1;

-- name: InsertCronTaskLog :one
INSERT INTO cron_task_logs (
    task_name, last_run_at, status, details
) VALUES (
    $1, CURRENT_TIMESTAMP, $2, $3
)
RETURNING *;

-- name: ListOpenOverdueIssues :many
SELECT id, location_code, created_at
FROM issues
WHERE status = 'OPEN'
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours'
ORDER BY id ASC;

-- name: ListAllActivePhotoBasenames :many
SELECT photo_before AS photo_name FROM issues WHERE photo_before != ''
UNION
SELECT photo_detail AS photo_name FROM issues WHERE photo_detail IS NOT NULL AND photo_detail != ''
UNION
SELECT photo_after AS photo_name FROM issues WHERE photo_after IS NOT NULL AND photo_after != '';

-- name: CleanupOldAuditLogs :exec
DELETE FROM system_audit_logs
WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '12 months';
