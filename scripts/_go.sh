#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run go inside the container hermetically
CONTAINER_RUNTIME="podman"
if ! command -v podman >/dev/null 2>&1; then
    CONTAINER_RUNTIME="docker"
fi

IMAGE_NAME="6s-go:1.23"

exec "$CONTAINER_RUNTIME" run --rm -i \
    -v "$PWD":/workspace:Z \
    -v 6s-test-go-module-cache:/go/pkg/mod \
    -v 6s-test-go-build-cache:/root/.cache/go-build \
    -w /workspace \
    -e CGO_ENABLED=0 \
    "$IMAGE_NAME" go "$@"
