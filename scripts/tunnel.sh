#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

if command -v podman >/dev/null 2>&1; then
  CONTAINER_RUNTIME="podman"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_RUNTIME="docker"
else
  echo "Error: Neither podman nor docker found." >&2
  exit 1
fi

mkdir -p "$ROOT/tmp"

echo "Starting dev stack with Cloudflare Tunnel..."
COMPOSE_PROFILES=tunnel ./leedevkit manage up dev

echo "Waiting for Cloudflare Tunnel URL..."
URL=""
for _ in $(seq 1 30); do
  URL=$("$CONTAINER_RUNTIME" logs leedevkit-dev-tunnel 2>&1 | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' | tail -1 || true)
  if [ -n "$URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Error: Timed out waiting for Cloudflare Tunnel URL." >&2
  echo "Check logs with: ./leedevkit manage logs dev tunnel" >&2
  exit 1
fi

echo "$URL" | tee "$ROOT/tmp/tunnel-url"
echo "$URL" > "$ROOT/.tunnel-url"

echo ""
echo "Tunnel ready: $URL"
