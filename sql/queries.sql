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
WHERE role IN ('ADMIN', 'SUPERADMIN') AND is_active = TRUE;

-- name: CreateLocalAdmin :one
INSERT INTO users (
    username, password_hash, auth_source, full_name, email, role, is_active
) VALUES (
    $1, $2, 'LOCAL', $3, $4, 'SUPERADMIN', TRUE
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
-- name: ListPermissions :many

SELECT * FROM permissions
ORDER BY code ASC;

-- name: ListRolePermissions :many
SELECT role, permission_code
FROM role_permissions
ORDER BY role ASC, permission_code ASC;

-- name: GetUserPermissions :many
SELECT rp.permission_code
FROM role_permissions rp
JOIN users u ON u.role = rp.role
WHERE u.id = $1
ORDER BY rp.permission_code ASC;

-- name: DeleteRolePermissions :exec
DELETE FROM role_permissions
WHERE role = $1;

-- name: AddRolePermission :exec
INSERT INTO role_permissions (role, permission_code)
VALUES ($1, $2)
ON CONFLICT (role, permission_code) DO NOTHING;

-- name: ReplaceRolePermissions :exec
WITH deleted AS (
    DELETE FROM role_permissions WHERE role = $1
)
INSERT INTO role_permissions (role, permission_code)
SELECT $1, permission_code
FROM unnest($2::varchar[]) AS permission_code
ON CONFLICT (role, permission_code) DO NOTHING;

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

-- name: UpdateLocation :one
UPDATE locations
SET name_vi = $2,
    name_zh = $3,
    name_en = $4,
    qr_code = $5
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
    client_uuid, version, creator_id, category, cause_type, location_code, description, photo_before, photo_detail, status
) VALUES (
    $1, 1, $2, $3, $4, $5, $6, $7, $8, 'OPEN'
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

-- name: ListTagsForIssues :many
SELECT it.issue_id, t.code, t.name_vi, t.name_zh, t.name_en, t.category
FROM tags t
JOIN issue_tags it ON t.code = it.tag_code
WHERE it.issue_id = ANY(sqlc.arg('issue_ids')::bigint[])
ORDER BY it.issue_id, t.code;


-- name: DeleteIssueTags :exec
DELETE FROM issue_tags
WHERE issue_id = $1;

-- name: ListIssuesFiltered :many
SELECT i.*, 
       COALESCE((
           SELECT SUM(CASE WHEN sl.points < 0 THEN -sl.points ELSE 0 END)
           FROM score_logs sl
           WHERE sl.issue_id = i.id
       ), 0)::bigint AS score_deducted,
       loc.name_vi AS location_name_vi,
       u.username AS creator_username,
       u.full_name AS creator_full_name,
       res.username AS resolver_username,
       res.full_name AS resolver_full_name
FROM issues i
JOIN locations loc ON i.location_code = loc.code
JOIN users u ON i.creator_id = u.id
LEFT JOIN users res ON i.resolver_id = res.id
WHERE (coalesce(cardinality(sqlc.narg('statuses')::varchar[]), 0) = 0 OR i.status = ANY(sqlc.narg('statuses')::varchar[]))
  AND (coalesce(cardinality(sqlc.narg('categories')::varchar[]), 0) = 0 OR i.category = ANY(sqlc.narg('categories')::varchar[]))
  AND (coalesce(cardinality(sqlc.narg('location_codes')::varchar[]), 0) = 0 OR i.location_code = ANY(sqlc.narg('location_codes')::varchar[]))
  AND (sqlc.narg('overdue')::boolean IS NULL OR sqlc.narg('overdue')::boolean = FALSE OR (i.status = 'OPEN' AND i.created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours'))
ORDER BY
    CASE WHEN i.category = '6S' THEN 0 ELSE 1 END,
    i.created_at DESC
LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: CountIssuesFiltered :one
SELECT COUNT(*) FROM issues
WHERE (coalesce(cardinality(sqlc.narg('statuses')::varchar[]), 0) = 0 OR status = ANY(sqlc.narg('statuses')::varchar[]))
  AND (coalesce(cardinality(sqlc.narg('categories')::varchar[]), 0) = 0 OR category = ANY(sqlc.narg('categories')::varchar[]))
  AND (coalesce(cardinality(sqlc.narg('location_codes')::varchar[]), 0) = 0 OR location_code = ANY(sqlc.narg('location_codes')::varchar[]))
  AND (sqlc.narg('overdue')::boolean IS NULL OR sqlc.narg('overdue')::boolean = FALSE OR (status = 'OPEN' AND created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours'));

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
    cause_type = COALESCE(sqlc.narg('cause_type'), cause_type),
    location_code = COALESCE(sqlc.narg('location_code'), location_code),
    description = COALESCE(sqlc.narg('description'), description),
    photo_before = COALESCE(sqlc.narg('photo_before'), photo_before),
    photo_detail = COALESCE(sqlc.narg('photo_detail'), photo_detail),
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

-- name: GetLocationLeaderboardStats :many
WITH score_totals AS (
    SELECT target_id AS location_code, COALESCE(SUM(points), 0)::bigint AS sum_points
    FROM score_logs
    WHERE target_type = 'LOCATION' AND score_logs.created_at >= sqlc.arg('created_at')
      AND (sqlc.narg('location_code')::varchar IS NULL OR score_logs.target_id = sqlc.narg('location_code'))
    GROUP BY target_id
), issue_totals AS (
    SELECT location_code,
           COUNT(*) FILTER (WHERE status = 'OPEN')::bigint AS open_count,
           COUNT(*) FILTER (WHERE status = 'OPEN' AND issues.created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours')::bigint AS overdue_count
    FROM issues
    GROUP BY location_code
)
SELECT l.code AS location_code,
       l.name_vi AS location_name,
       COALESCE(st.sum_points, 0)::bigint AS sum_points,
       COALESCE(it.open_count, 0)::bigint AS open_count,
       COALESCE(it.overdue_count, 0)::bigint AS overdue_count
FROM locations l
LEFT JOIN score_totals st ON st.location_code = l.code
LEFT JOIN issue_totals it ON it.location_code = l.code
WHERE l.is_active = TRUE
  AND (sqlc.narg('location_code')::varchar IS NULL OR l.code = sqlc.narg('location_code'))
ORDER BY l.code;

-- name: GetReporterLeaderboardInMonth :many
SELECT u.id AS user_id,
       u.full_name,
       COALESCE(SUM(sl.points), 0)::bigint AS points,
       COUNT(DISTINCT CASE WHEN i.status = 'CLOSED'
             AND (sqlc.narg('location_code')::varchar IS NULL OR i.location_code = sqlc.narg('location_code'))
             THEN i.id END)::bigint AS valid_count,
       COUNT(DISTINCT CASE WHEN i.status = 'CLOSED' AND i.category = '6S'
             AND (sqlc.narg('location_code')::varchar IS NULL OR i.location_code = sqlc.narg('location_code'))
             THEN i.id END)::bigint AS safety_count
FROM users u
JOIN score_logs sl ON sl.target_type = 'USER' AND sl.target_id = u.id::varchar
LEFT JOIN issues i ON i.id = sl.issue_id
WHERE sl.created_at >= sqlc.arg('created_at')
GROUP BY u.id, u.full_name
ORDER BY points DESC, valid_count DESC, u.id ASC
LIMIT 50;


-- name: ListScoreLogsSince :many
SELECT * FROM score_logs
WHERE created_at >= $1
ORDER BY id ASC;

-- name: ListScoreLogsByIssue :many
SELECT sl.*, COALESCE(sr.description, sl.rule_key) AS rule_description
FROM score_logs sl
LEFT JOIN scoring_rules sr ON sl.rule_key = sr.rule_key
WHERE sl.issue_id = $1
ORDER BY sl.id ASC;

-- name: ListScoreLogsByTargetSince :many
SELECT sl.*, COALESCE(sr.description, sl.rule_key) AS rule_description,
       COALESCE(i.category, '') AS issue_category,
       COALESCE(i.description, '') AS issue_description,
       COALESCE(i.status, '') AS issue_status
FROM score_logs sl
LEFT JOIN scoring_rules sr ON sl.rule_key = sr.rule_key
LEFT JOIN issues i ON sl.issue_id = i.id
WHERE sl.target_type = $1 AND sl.target_id = $2 AND sl.created_at >= $3
ORDER BY sl.created_at DESC, sl.id DESC;

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

-- name: GetAIConfig :one
SELECT * FROM ai_configs
WHERE id = 1 LIMIT 1;

-- name: UpsertAIConfig :one
INSERT INTO ai_configs (
    id, is_enabled, base_url, api_key, default_model,
    model_translate, model_vision, model_summary,
    updated_at, updated_by
) VALUES (
    1, $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8
)
ON CONFLICT (id) DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    base_url = EXCLUDED.base_url,
    api_key = CASE WHEN EXCLUDED.api_key = '' THEN ai_configs.api_key ELSE EXCLUDED.api_key END,
    default_model = EXCLUDED.default_model,
    model_translate = EXCLUDED.model_translate,
    model_vision = EXCLUDED.model_vision,
    model_summary = EXCLUDED.model_summary,
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
WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '3 years';

-- name: GetReportKPISummary :one
SELECT
    COUNT(*)::bigint AS total_issues,
    COUNT(CASE WHEN status = 'OPEN' THEN 1 END)::bigint AS open_issues,
    COUNT(CASE WHEN status = 'PENDING_REVIEW' THEN 1 END)::bigint AS pending_review_issues,
    COUNT(CASE WHEN status = 'CLOSED' THEN 1 END)::bigint AS closed_issues,
    COUNT(CASE WHEN status = 'INVALID' THEN 1 END)::bigint AS invalid_issues,
    COUNT(CASE WHEN category = '6S' AND status != 'CLOSED' THEN 1 END)::bigint AS safety_issues,
    COUNT(CASE WHEN status = 'OPEN' AND created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours' THEN 1 END)::bigint AS overdue_issues
FROM issues
WHERE (sqlc.narg('location_code')::varchar IS NULL OR location_code = sqlc.narg('location_code'));

-- name: GetCategoryBreakdown :many
SELECT category, COUNT(*)::bigint AS count
FROM issues
WHERE (sqlc.narg('location_code')::varchar IS NULL OR location_code = sqlc.narg('location_code'))
GROUP BY category ORDER BY category ASC;

-- name: GetIssueTrends :many
SELECT d.day::date AS date_key,
       COUNT(CASE WHEN i.created_at::date = d.day::date THEN 1 END)::bigint AS created_count,
       COUNT(CASE WHEN (i.closed_at::date = d.day::date OR (i.closed_at IS NULL AND i.resolved_at::date = d.day::date)) THEN 1 END)::bigint AS resolved_count
FROM generate_series(CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day', CURRENT_DATE, INTERVAL '1 day') AS d(day)
LEFT JOIN issues i ON (i.created_at::date = d.day::date OR i.closed_at::date = d.day::date OR (i.closed_at IS NULL AND i.resolved_at::date = d.day::date))
  AND (sqlc.narg('location_code')::varchar IS NULL OR i.location_code = sqlc.narg('location_code'))
GROUP BY d.day ORDER BY d.day ASC;

-- name: GetTopViolatedTags :many
SELECT t.code AS tag_code, t.category, t.name_vi, t.name_zh, t.name_en, COUNT(it.issue_id)::bigint AS violation_count
FROM issue_tags it JOIN tags t ON it.tag_code = t.code JOIN issues i ON i.id = it.issue_id
WHERE (sqlc.narg('location_code')::varchar IS NULL OR i.location_code = sqlc.narg('location_code'))
GROUP BY t.code, t.category, t.name_vi, t.name_zh, t.name_en
ORDER BY violation_count DESC, t.code ASC LIMIT $1;

-- name: ListIssuesForExport :many
SELECT i.id, i.client_uuid, i.category, i.location_code, loc.name_vi AS location_name_vi, loc.name_zh AS location_name_zh, loc.name_en AS location_name_en, i.status, i.description, i.reject_reason, u.username AS creator_username, u.full_name AS creator_full_name, res.username AS resolver_username, res.full_name AS resolver_full_name, i.score_rating, i.created_at, i.resolved_at, i.closed_at, COALESCE(STRING_AGG(it.tag_code, '; ' ORDER BY it.tag_code), '')::varchar AS tags_string
FROM issues i JOIN locations loc ON i.location_code = loc.code JOIN users u ON i.creator_id = u.id LEFT JOIN users res ON i.resolver_id = res.id LEFT JOIN issue_tags it ON it.issue_id = i.id
WHERE (sqlc.narg('status')::varchar IS NULL OR i.status = sqlc.narg('status')) AND (sqlc.narg('category')::varchar IS NULL OR i.category = sqlc.narg('category')) AND (sqlc.narg('location_code')::varchar IS NULL OR i.location_code = sqlc.narg('location_code'))
GROUP BY i.id, loc.code, loc.name_vi, loc.name_zh, loc.name_en, u.id, res.id ORDER BY i.created_at DESC LIMIT 100000;



-- name: GetTranslationCache :one
SELECT content_hash, target_lang, source_text, translated_text, created_at
FROM translation_cache
WHERE content_hash = $1 AND target_lang = $2;

-- name: UpsertTranslationCache :one
INSERT INTO translation_cache (
    content_hash, target_lang, source_text, translated_text
) VALUES (
    $1, $2, $3, $4
)
ON CONFLICT (content_hash, target_lang) DO UPDATE
SET translated_text = EXCLUDED.translated_text,
    source_text = EXCLUDED.source_text
RETURNING *;

-- name: GetTranslationCacheBatch :many
SELECT content_hash, translated_text
FROM translation_cache
WHERE content_hash = ANY(sqlc.arg('content_hashes')::varchar[]) AND target_lang = sqlc.arg('target_lang');
