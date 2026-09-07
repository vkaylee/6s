# Target
Own `openapi.yaml` only if contract correction is necessary, `web/src/api/client.ts`, `web/src/api/operations.ts`, manual frontend type definitions, generated-client configuration, and contract tests. Do not edit generated files by hand; coordinate SQLC separately.

# Change
Make generated OpenAPI client the single transport. Remove fake `Client` adapter and unsafe envelope casts. Reconcile Issue, Tag, and pagination types against OpenAPI; regenerate using configured script. Make base URL environment-driven. Validate untrusted response envelopes at the boundary using existing dependencies/stdlib, not a new dependency without need.

# Acceptance
All callers compile against one contract; no double unwrap; API errors remain safe; generated drift check passes; base URL has no LAN hardcode. Document any intentional breaking change and update callers. Commit owned files.