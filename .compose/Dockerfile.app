# syntax=docker/dockerfile:1
#
# Production application image for the 6S Issue Management System.
# Single self-contained binary: the Go server embeds the built web SPA
# (web/embed.go -> //go:embed all:dist), so one container serves API + UI.
#
# Stages:
#   1. web    — build the SPA bundle with Bun (Vite production build).
#   2. server — compile the static Go binary with the embedded SPA assets.
#   3. runtime— minimal hardened image: non-root, tzdata, ca-certificates.
#
# Build args feed OCI image labels for release traceability
# (release-management.md §1: artifact traceable to source revision + CI run).

# --- Stage 1: web assets ---------------------------------------------------
FROM docker.io/oven/bun:1.1 AS web
WORKDIR /src/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

# --- Stage 2: server binary ------------------------------------------------
FROM docker.io/library/golang:1.23-bookworm AS server
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
# Static, reproducible binary: no cgo, trimmed paths, stripped symbols.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server ./cmd/server

# --- Stage 3: runtime ------------------------------------------------------
FROM docker.io/library/debian:bookworm-slim AS runtime

ARG VERSION=dev
ARG REVISION=unknown
ARG BUILD_DATE=unknown
ARG SOURCE=unknown

# ca-certificates: outbound TLS (AI providers, LDAP-over-TLS).
# tzdata: time.LoadLocation() for the factory-timezone cron scheduler.
# wget: container HEALTHCHECK against /api/health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata wget \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /data

LABEL org.opencontainers.image.title="6s" \
      org.opencontainers.image.description="6S Issue Management System application server" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="${SOURCE}" \
      org.opencontainers.image.licenses="UNLICENSED"

WORKDIR /
COPY --from=server --chown=root:root /server /usr/local/bin/server

USER appuser

ENV SERVER_PORT=8080 \
    DATA_DIR=/data

EXPOSE 8080

# Liveness only (dependency-free). Readiness (/api/ready) is gated by the
# orchestrator/reverse proxy, matching the server's health endpoint split.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
    CMD wget --spider --quiet "http://localhost:${SERVER_PORT}/api/health" || exit 1

ENTRYPOINT ["server"]
