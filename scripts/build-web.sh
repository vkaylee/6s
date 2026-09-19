#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LOCK_DIR="${DEV_BUILD_LOCK:-$ROOT/tmp/dev-build.lock}"
STAGING_DIR="$ROOT/web/dist.next"
DIST_DIR="$ROOT/web/dist"
TRIGGER="$ROOT/.air-web-trigger"

acquire_lock() {
  mkdir -p "$(dirname "$LOCK_DIR")"
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    sleep 0.1
  done
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM
}

acquire_lock
rm -rf "$STAGING_DIR"
(
  cd "$ROOT/web"
  bunx tsc
  bunx vite build --outDir dist.next
)
if [ -d "$DIST_DIR" ]; then
  mv "$DIST_DIR" "$ROOT/web/dist.previous"
fi
mv "$STAGING_DIR" "$DIST_DIR"
rm -rf "$ROOT/web/dist.previous"

printf '%s\n' "$(date +%s%N)" > "$TRIGGER"
