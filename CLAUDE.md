# 6S Issue Management System

## LeeDevKit base context

This repository uses LeeDevKit. Before making changes, read and apply:
`.leedevkit/templates/CLAUDE.base.md`.

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
