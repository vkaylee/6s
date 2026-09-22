#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LOCK_FILE="${DEV_BUILD_LOCK:-$ROOT/tmp/dev-build.lock}"
STAGING_DIR="$ROOT/web/dist.next"
DIST_DIR="$ROOT/web/dist"
TRIGGER="$ROOT/.air-web-trigger"

acquire_lock() {
  mkdir -p "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  flock -x 9
}

acquire_lock
rm -rf "$STAGING_DIR"
(
  cd "$ROOT/web"
  bunx tsc -p tsconfig.build.json
  bunx vite build --outDir dist.next
)
if [ -d "$DIST_DIR" ]; then
  mv "$DIST_DIR" "$ROOT/web/dist.previous"
fi
mv "$STAGING_DIR" "$DIST_DIR"
rm -rf "$ROOT/web/dist.previous"

printf '%s\n' "$(date +%s%N)" > "$TRIGGER"
