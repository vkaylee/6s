# 6S Issue Management System

<!-- leedevkit:start -->
## LeeDevKit base context

This repository uses LeeDevKit. Before making changes, read and apply:
`~/.leedevkit/current/templates/CLAUDE.base.md`.

Project policy lives in `.agent/`; devkit sources live at:
- Built-in skills: `~/.leedevkit/current/.agent/skills/*/SKILL.md`
- Community skills: `.agent/skills.d/*/SKILL.md`
- Built-in agents: `~/.leedevkit/current/.agent/agents/*.md`
- Project agents: `.agent/agents/*.md`

Use the globally installed `leedevkit --help` for available project commands.
<!-- leedevkit:end -->
## Mandatory Tool Wrappers & Hermetic Execution

Do not run raw ecosystem binaries directly (`go`, `bun`, `sqlc`, `docker-compose`, etc.) when the project provides wrappers.

| Purpose | Canonical Wrapper | Example |
|---|---|---|
| Server Lint | `leedevkit test server --lint-only` | `leedevkit test server --lint-only` |
| Server Unit Tests | `leedevkit test server --unit-only` | `leedevkit test server --unit-only` |
| Web Lint | `leedevkit test web --lint-only` | `leedevkit test web --lint-only` |
| Web Unit Tests | `leedevkit test web --unit-only` | `leedevkit test web --unit-only` |
| Full Test Suite | `leedevkit test all` | `leedevkit test all` |
| Hermetic Go CLI | `./scripts/_go.sh` | `./scripts/_go.sh test ./...` |
| Hermetic Bun CLI | `./scripts/_bun.sh` | `./scripts/_bun.sh test` |
| Hermetic SQLC CLI | `./scripts/_sqlc.sh` | `./scripts/_sqlc.sh generate` |
| Environment / Infra | `leedevkit dev <cmd>` | `leedevkit dev up` |

AI agents MUST check for and use these wrappers before running any host command.

## Dev & Test Commands

- Health check:
  ```sh
  leedevkit doctor
  ```

- Testing:
  ```sh
  leedevkit test server --lint-only  # Go format, go vet & golangci-lint
  leedevkit test server --unit-only  # Go unit tests
  leedevkit test web --lint-only     # TypeScript & Biome lint checks
  leedevkit test web --unit-only     # Bun tests
  leedevkit test all                 # Full suite
  ```

- Infrastructure management:
  ```sh
  leedevkit dev up                   # Start dev environment (Go API + Web + Caddy TLS)
  leedevkit dev down                 # Stop dev environment
  leedevkit dev ps                   # Show status of dev containers
  leedevkit dev logs                 # View logs
  ```

The rules below add specific constraints. Apply both.
