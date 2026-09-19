#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT/web"

bun install
"$ROOT/scripts/build-web.sh"
exec bun "$ROOT/scripts/dev-web-watch.ts"
