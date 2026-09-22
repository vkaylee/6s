#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LOCK_FILE="${DEV_BUILD_LOCK:-$ROOT/tmp/dev-build.lock}"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -x 9

go build -o "$ROOT/tmp/main" ./cmd/server
