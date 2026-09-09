# 6S Issue Management System

## LeeDevKit base context

This repository uses LeeDevKit. Before making changes, read and apply:
`.leedevkit/templates/CLAUDE.base.md`.

## Mandatory Tool Wrappers & Hermetic Execution

Do not run raw ecosystem binaries directly (`go`, `bun`, `sqlc`, `docker-compose`, etc.) when the project provides wrappers.

| Purpose | Canonical Wrapper | Example |
|---|---|---|
| Server Lint | `./leedevkit test server --lint-only` | `./leedevkit test server --lint-only` |
| Server Unit Tests | `./leedevkit test server --unit-only` | `./leedevkit test server --unit-only` |
| Web Lint | `./leedevkit test web --lint-only` | `./leedevkit test web --lint-only` |
| Web Unit Tests | `./leedevkit test web --unit-only` | `./leedevkit test web --unit-only` |
| Full Test Suite | `./leedevkit test all` | `./leedevkit test all` |
| Hermetic Go CLI | `./scripts/_go.sh` | `./scripts/_go.sh test ./...` |
| Hermetic Bun CLI | `./scripts/_bun.sh` | `./scripts/_bun.sh test` |
| Hermetic SQLC CLI | `./scripts/_sqlc.sh` | `./scripts/_sqlc.sh generate` |
| Environment / Infra | `./leedevkit manage <cmd>` | `./leedevkit manage up dev` |

AI agents MUST check for and use these wrappers before running any host command.

## Dev & Test Commands

- Health check:
  ```sh
  ./leedevkit doctor
  ```

- Testing:
  ```sh
  ./leedevkit test server --lint-only  # Go format, go vet & golangci-lint
  ./leedevkit test server --unit-only  # Go unit tests
  ./leedevkit test web --lint-only     # TypeScript & Biome lint checks
  ./leedevkit test web --unit-only     # Bun tests
  ./leedevkit test all                 # Full suite
  ```

- Infrastructure management:
  ```sh
  ./leedevkit manage up dev            # Start dev environment (Go API + Web + Caddy TLS)
  ./leedevkit manage down dev          # Stop dev environment
  ./leedevkit manage ps dev            # Show status of dev containers
  ./leedevkit manage logs dev          # View logs
  ```
