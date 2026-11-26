#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run go inside the container hermetically
IMAGE_NAME="${GO_DEV_IMAGE:-6s-go-dev:1.26}"

if [[ -z "${CONTAINER_RUNTIME:-}" ]]; then
    if command -v podman >/dev/null 2>&1 && podman image exists "$IMAGE_NAME" >/dev/null 2>&1; then
        CONTAINER_RUNTIME="podman"
    elif command -v docker >/dev/null 2>&1 && docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        CONTAINER_RUNTIME="docker"
    elif command -v podman >/dev/null 2>&1; then
        CONTAINER_RUNTIME="podman"
    else
        CONTAINER_RUNTIME="docker"
    fi
fi

MOUNT_SUFFIX=""
if [[ "$CONTAINER_RUNTIME" == "podman" ]]; then
    MOUNT_SUFFIX=":Z"
fi

RUN_ARGS=(--rm -i)
if [[ "${GO_NETWORK:-}" != "" ]]; then
    RUN_ARGS+=(--network "${GO_NETWORK}")
fi
exec "$CONTAINER_RUNTIME" run "${RUN_ARGS[@]}" \
    -v "$PWD:/workspace${MOUNT_SUFFIX}" \
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
