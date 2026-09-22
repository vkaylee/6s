#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
rm -f "$ROOT/.air-web-trigger"
rm -rf "${DEV_BUILD_LOCK:-$ROOT/tmp/dev-build.lock}"
"$ROOT/scripts/dev-web.sh" &
watcher_pid=$!

cleanup() {
  kill "$watcher_pid" 2>/dev/null || true
  wait "$watcher_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

while [ ! -s "$ROOT/.air-web-trigger" ]; do
  if ! kill -0 "$watcher_pid" 2>/dev/null; then
    echo "[dev-app] web build watcher exited before initial build" >&2
    exit 1
  fi
  sleep 0.2
done

air -c "$ROOT/.air.toml"
status=$?
cleanup
exit "$status"
