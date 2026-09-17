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

`.compose/docker-compose.prod.yml` runs a production-shaped stack: the immutable
app image, Postgres over TLS (self-signed cert generated at container startup),
and Caddy terminating TLS at the edge. Unlike dev, it runs the compiled binary
(no hot reload), assembles `DB_DSN` with `sslmode=require`, and fails closed if
`DB_PASSWORD`, `JWT_SECRET`, or `APP_ENCRYPTION_KEY` are missing.

```sh
cp .env.prod.example .env.prod          # then fill in REAL secrets
# generate values, e.g.:
#   JWT_SECRET=$(openssl rand -base64 48)
#   APP_ENCRYPTION_KEY=$(openssl rand -base64 32)   # exactly 32 raw bytes
#   DB_PASSWORD=$(openssl rand -base64 24)
podman compose --env-file .env.prod -f .compose/docker-compose.prod.yml up -d --build
```

Then open `https://localhost:${PROD_HTTPS_PORT:-8444}` and trust Caddy's
internal CA certificate as described above. `.env.prod` is git-ignored; never
commit real secrets. Stop and remove the stack (including volumes) with
`podman compose --env-file .env.prod -f .compose/docker-compose.prod.yml down -v`.

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
