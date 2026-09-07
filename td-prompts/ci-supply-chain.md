# Target
Own CI configuration, `leedevkit.toml` integration, `.golangci.yml` lint freshness, dependency update config, and security-scan scripts. Do not edit application code or generated API/SQL.

# Change
Add reproducible CI gates for server/web lint, unit, E2E, dependency vulnerability checks, SBOM, and secret scanning. Use available project wrappers. Replace deprecated `exportloopref` with current equivalent. Add automated dependency update configuration only where supported. Keep secrets out of logs.

# Acceptance
CI fails on lint/test/security violations and reports artifacts. Local wrapper commands remain usable. Validate configuration syntax and one representative job; do not claim remote CI execution. Commit owned tooling files.