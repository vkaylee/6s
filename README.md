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

## Production image & staging stack

The production app image (`.compose/Dockerfile.app`) is a multi-stage build:
Bun compiles the web SPA, Go embeds it and produces a single static binary, and
the result ships in a slim non-root `debian:bookworm-slim` runtime. One
container serves both the API and the UI. CI builds and scans this image
(Trivy CRITICAL/HIGH block + CycloneDX SBOM) but does not push to a registry yet.

Build only (no `.env` or runtime secrets required):

```sh
./scripts/build-image.sh
./scripts/build-image.sh --tag v1.0.0
./scripts/build-image.sh --image localhost/6s-app --tag staging
```

The script prefers Podman, falls back to Docker, and works from any working
directory. The default tag is `sha-<12-character Git revision>`; OCI labels
record the full revision and build time. It builds the current working tree,
so a revision label alone does not certify that local changes are committed.
It never pushes images or starts services. CI continues using Buildx directly.

`.compose/docker-compose.prod.yml` runs a production-shaped stack: Postgres,
the immutable app image, and Caddy terminating TLS at the edge. Deployment has
an explicit one-shot `role-provisioner` and `migrator` step before `server`;
the migrator uses `MIGRATOR_*` credentials and the runtime server uses only
`RUNTIME_*` credentials. Runtime credentials cannot create or alter schema.

```sh
cp .env.prod.example .env.prod          # fill every placeholder with real secrets
podman compose --env-file .env.prod -f .compose/docker-compose.prod.yml build
podman compose --env-file .env.prod -f .compose/docker-compose.prod.yml run --rm migrator migrate validate
podman compose --env-file .env.prod -f .compose/docker-compose.prod.yml up -d
```

The migrator runs from the same image tag as the server. `status` and `validate`
are read-only; `up` is the only schema-changing action. Do not run down scripts,
reset volumes, or roll back with an older binary. For the already-applied
000022 incident, stop old writers, preserve the ledger and data, compare the
artifact/checksum, then deploy a new binary and follow the separate recovery
runbook; never edit migration 000022.

For a disposable smoke environment, use a unique `COMPOSE_PROJECT_NAME` and
unique volume names (or omit the production named volumes); never point this
procedure at an existing production volume. The runtime role must not be used
for DDL or ledger writes.

The image healthcheck is liveness-only (`/api/health`); Caddy admits traffic
only after its upstream readiness check (`/api/ready`) succeeds. A database
outage therefore does not create a liveness restart loop.

```sh
podman compose --env-file .env.prod -f .compose/docker-compose.prod.yml down
```
On first launch, create the initial superadmin through the setup dialog; no
existing login is required. Setup is rejected once an active admin exists.
Restrict network access to trusted operators until initialization is complete,
because the setup endpoint is public during this bootstrap window.

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
