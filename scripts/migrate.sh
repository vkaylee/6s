#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ("$1" != "status" && "$1" != "validate" && "$1" != "up") ]]; then
  echo "usage: $0 <status|validate|up>" >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
exec "$CONTAINER_RUNTIME" run --rm -i --network=host "${RUNTIME_ARGS[@]}" \
  -v "$(cd "$SCRIPT_DIR/.." && pwd):/workspace${MOUNT_SUFFIX}" \
  -v 6s-test-go-module-cache:/go/pkg/mod \
  -v 6s-test-go-build-cache:/root/.cache/go-build \
  -w /workspace -e CGO_ENABLED=0 -e MIGRATION_DB_DSN -e MIGRATION_TIMEOUT \
  -e MIGRATION_LOCK_TIMEOUT -e MIGRATION_STATEMENT_TIMEOUT \
  "$IMAGE_NAME" go run ./cmd/migrate "$1"
