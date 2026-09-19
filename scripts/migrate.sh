#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ("$1" != "status" && "$1" != "validate" && "$1" != "up") ]]; then
  echo "usage: $0 <status|validate|up>" >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_RUNTIME="podman"
RUNTIME_ARGS=()
if command -v podman >/dev/null 2>&1; then
  RUNTIME_ARGS+=(--userns=keep-id)
else
  CONTAINER_RUNTIME="docker"
fi
IMAGE_NAME="6s-go:1.23"
exec "$CONTAINER_RUNTIME" run --rm -i --network=host "${RUNTIME_ARGS[@]}" \
  -v "$(cd "$SCRIPT_DIR/.." && pwd)":/workspace:Z \
  -v 6s-test-go-module-cache:/go/pkg/mod \
  -v 6s-test-go-build-cache:/root/.cache/go-build \
  -w /workspace -e CGO_ENABLED=0 -e MIGRATION_DB_DSN -e MIGRATION_TIMEOUT \
  -e MIGRATION_LOCK_TIMEOUT -e MIGRATION_STATEMENT_TIMEOUT \
  "$IMAGE_NAME" go run ./cmd/migrate "$1"
