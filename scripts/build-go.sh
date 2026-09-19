#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LOCK_DIR="${DEV_BUILD_LOCK:-$ROOT/tmp/dev-build.lock}"

mkdir -p "$(dirname "$LOCK_DIR")"
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  sleep 0.1
done
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

exec go build -o "$ROOT/tmp/main" ./cmd/server
