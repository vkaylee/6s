# Target
Own `internal/config/config.go`, startup config validation in `cmd/server/main.go`, `internal/auth/token.go`, config tests, `.env.example` if absent. Do not edit auth handlers, migration runner, observability middleware, frontend, CI.

# Change
Remove insecure DB/JWT defaults. Fail closed on missing/invalid `DB_DSN` and `JWT_SECRET`; require TLS per applicable rules without breaking explicitly supported local setup. Shorten access/refresh TTLs to standards or document a reviewed exception. Keep CLI flags behavior deliberate. Add behavior tests for missing secrets, invalid config, and token expiry.

# Acceptance
No secret/default credential in source. Startup/config rejects unsafe production config. Tests prove negative paths. Rebase only after baseline acceptance. Run focused config/auth tests; commit `td/security-config-*`. Report compatibility impact.