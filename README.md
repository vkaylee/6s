# 6S Issue Management System

## Setup

Requirements: Docker or Podman, LeeDevKit.

```sh
./leedevkit doctor
./leedevkit manage up dev
```

The development stack provides PostgreSQL, the Go API, the web app, and Caddy TLS. Stop it with `./leedevkit manage down dev`.

### Trust the development certificate

Caddy uses an internal CA for HTTPS. Trust its root certificate once on the development machine; otherwise Vite HMR WebSocket connections can fail and the browser may refresh the page continuously.

Export the CA certificate:

```sh
podman exec leedevkit-dev_caddy_1 cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
```

On Windows, open `caddy-root.crt` and install it for **Current User** in **Trusted Root Certification Authorities**, then restart the browser. On Linux, import it into the browser or OS trust store used by the browser. Open `https://127.0.0.1:8443` after installation.

If the container name differs, find it with `./leedevkit manage ps dev` and replace `leedevkit-dev_caddy_1` in the export command.

Do not disable certificate validation globally. This certificate is for local development only.

## Verification

```sh
./leedevkit test server --lint-only
./leedevkit test server --unit-only
./leedevkit test web --lint-only
./leedevkit test web --unit-only
```

Run full browser E2E in an isolated container without installing host browsers:

```sh
./leedevkit test web --e2e-only
```

The E2E runner launches Chromium inside an isolated test environment with a dedicated disposable database and test server. Failure screenshots and traces are saved to `artifacts/e2e/`.
Audit logs remain for 3 years. Weekly cleanup follows `.agent/rules/data-governance.md` and `sql/queries.sql`.
