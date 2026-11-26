#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for runtime in docker podman; do
  printf '%s\n' '#!/usr/bin/env bash' 'if [[ "$1" == "run" ]]; then printf "%s\\n" "${0##*/}:$*" >> "$CALLS"; exit 0; fi' '[[ "${0##*/}" == "$AVAILABLE_RUNTIME" ]]' > "$tmp/$runtime"
  chmod +x "$tmp/$runtime"
done

export PATH="$tmp:$PATH" CALLS="$tmp/calls"
export AVAILABLE_RUNTIME=docker
(
  cd "$root"
  ./scripts/_go.sh version
  ./scripts/security-scan.sh sbom
)
grep -q '^docker:run .*6s-go-dev:1.26 go version' "$CALLS"
grep -q '^docker:run .*6s-go-dev:1.26 syft ' "$CALLS"

: > "$CALLS"
export AVAILABLE_RUNTIME=podman
(
  cd "$root"
  ./scripts/_go.sh version
  ./scripts/security-scan.sh sbom
)
grep -q '^podman:run .*6s-go-dev:1.26 go version' "$CALLS"
grep -q '^podman:run .*6s-go-dev:1.26 syft ' "$CALLS"

: > "$CALLS"
export CONTAINER_RUNTIME=docker
(
  cd "$root"
  ./scripts/_go.sh version
  ./scripts/security-scan.sh sbom
)
grep -q '^docker:run .*6s-go-dev:1.26 go version' "$CALLS"
grep -q '^docker:run .*6s-go-dev:1.26 syft ' "$CALLS"
