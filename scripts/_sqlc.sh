#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run sqlc inside the container hermetically
CONTAINER_RUNTIME="podman"
if ! command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME="docker"
fi

IMAGE_NAME="6s-go-dev:1.23"

exec "$CONTAINER_RUNTIME" run --rm -i \
    --userns=keep-id \
    -v "$PWD":/workspace:Z \
    -w /workspace \
    "$IMAGE_NAME" sqlc "$@"
