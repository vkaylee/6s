#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run bun inside the container hermetically
CONTAINER_RUNTIME="podman"
if ! command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME="docker"
fi

IMAGE_NAME="6s-bun-dev:1.1"

exec "$CONTAINER_RUNTIME" run --rm -i \
    --userns=keep-id \
    -v "$PWD":/workspace:Z \
    -v 6s_web-node-modules:/workspace/web/node_modules:Z \
    -w /workspace/web \
    "$IMAGE_NAME" bun "$@"
