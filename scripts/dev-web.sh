#!/bin/sh
set -e

# Initial package installation
bun install

# Watch package.json and lockfile for automated hot install in container
(
  LAST_HASH="$(md5sum package.json bun.lockb 2>/dev/null || true)"
  while true; do
    sleep 2
    CURR_HASH="$(md5sum package.json bun.lockb 2>/dev/null || true)"
    if [ "$LAST_HASH" != "$CURR_HASH" ]; then
      echo "[dev-watcher] package.json or bun.lockb changed -> auto running bun install..."
      bun install || true
      LAST_HASH="$CURR_HASH"
    fi
  done
) &

# Launch Vite dev server with native HMR
exec bun run dev --host 0.0.0.0 --port 5173
