#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run go inside the container hermetically
CONTAINER_RUNTIME="podman"
if ! command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME="docker"
fi

IMAGE_NAME="6s-go:1.23"

RUN_ARGS=(--rm -i)
if [[ "${GO_NETWORK:-}" != "" ]]; then
    RUN_ARGS+=(--network "${GO_NETWORK}")
fi
exec "$CONTAINER_RUNTIME" run "${RUN_ARGS[@]}" \
    -v "$PWD":/workspace:Z \
    -v 6s-test-go-module-cache:/go/pkg/mod \
    -v 6s-test-go-build-cache:/root/.cache/go-build \
    -w /workspace \
    -e CGO_ENABLED=0 \
    -e TEST_DB_DSN \
    -e MIGRATION_DB_DSN \
    -e MIGRATION_TIMEOUT \
    -e MIGRATION_LOCK_TIMEOUT \
    -e MIGRATION_STATEMENT_TIMEOUT \
    "$IMAGE_NAME" go "$@"
