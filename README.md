# 6S Issue Management System

## Setup

Requirements: Docker or Podman, LeeDevKit.

```sh
./leedevkit doctor
./leedevkit manage up dev
```

The development stack provides PostgreSQL, the Go API, the web app, and Caddy TLS. Stop it with `./leedevkit manage down dev`.

## Verification

```sh
./leedevkit test server --lint-only
./leedevkit test server --unit-only
./leedevkit test web --lint-only
./leedevkit test web --unit-only
```

Run browser E2E from `web/` after installing the Playwright browser binary:

```sh
bunx playwright install chromium
bunx playwright test
```

Audit logs remain for 3 years. Weekly cleanup follows `.agent/rules/data-governance.md` and `sql/queries.sql`.
