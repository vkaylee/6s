#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run sqlc inside the container hermetically
IMAGE_NAME="${GO_DEV_IMAGE:-6s-go-dev:1.26}"
if [[ -z "${CONTAINER_RUNTIME:-}" ]]; then
    if command -v podman >/dev/null 2>&1 && podman image exists "$IMAGE_NAME" >/dev/null 2>&1; then
        CONTAINER_RUNTIME="podman"
    else
        CONTAINER_RUNTIME="docker"
    fi
fi

RUNTIME_ARGS=()
MOUNT_SUFFIX=""
if [[ "$CONTAINER_RUNTIME" == "podman" ]]; then
    RUNTIME_ARGS+=(--userns=keep-id)
    MOUNT_SUFFIX=":Z"
fi

exec "$CONTAINER_RUNTIME" run --rm -i "${RUNTIME_ARGS[@]}" \
    -v "$PWD:/workspace${MOUNT_SUFFIX}" \
    -w /workspace \
    "$IMAGE_NAME" sqlc "$@"
