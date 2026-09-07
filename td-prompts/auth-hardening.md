# Target
Own `internal/auth/handler.go`, `internal/auth/middleware.go`, auth tests, and directly required auth DB/query files. Do not edit `cmd/server/main.go` except with explicit integration-owner approval; do not edit config/token TTL owned by security-config.

# Change
Inventory callers before removing query-token auth; remove it if no supported caller remains, otherwise make exception explicit and bounded. Require authentication/authorization for bootstrap superadmin. Make refresh rotation atomic. Detect revoked-token reuse and revoke the token family/user as required. Mask audit PII. Return client-safe auth errors.

# Acceptance
Unauthenticated bootstrap fails. Reuse/rotation race cannot leave inconsistent state. Sensitive tokens never appear in URL/log response. Behavior tests cover success, revoked token, reuse, transaction failure. Rebase after security-config if token contracts changed. Commit owned files only.