#!/usr/bin/env bash
set -euo pipefail

# Pinned scanner versions. Keep in lockstep with .compose/Dockerfile.golang.
: "${GOVULNCHECK_VERSION:=v1.1.4}"
: "${SYFT_VERSION:=v1.18.1}"
: "${GITLEAKS_VERSION:=v8.24.2}"
: "${BUN_IMAGE:=docker.io/oven/bun:1.4.1}"
: "${GO_DEV_IMAGE:=6s-go-dev:1.23}"

mode=${1:?usage: $0 {go|web|sbom|secrets}}
mode=${mode%\}}
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
mkdir -p artifacts/security

container_runtime() {
  if command -v podman >/dev/null 2>&1; then
    printf 'podman'
  elif command -v docker >/dev/null 2>&1; then
    printf 'docker'
  fi
}

runtime_args() { # <runtime> -> prints "-v src:dst" mount suffix for SELinux
  if [ "$1" = podman ]; then
    printf '%s' ':Z'
  else
    printf '%s' ''
  fi
}

# Fail closed: run the scanner from PATH, or from the pinned dev image. Never
# exit 0 when no scanner can run; a missing tool is a broken gate, not a pass.
run_scanner() { # <binary> <image> <pinned version> <args...>
  local binary=$1 image=$2 version=$3
  shift 3
  if command -v "$binary" >/dev/null 2>&1; then
    "$binary" "$@"
    return
  fi
  local runtime suffix
  runtime=$(container_runtime)
  if [ -z "$runtime" ]; then
    echo "$binary $version required: install it or provide podman/docker with image $image" >&2
    exit 1
  fi
  suffix=$(runtime_args "$runtime")
  local flags=()
  if [ "$runtime" = podman ]; then
    flags=(--userns=keep-id)
  fi
  "$runtime" run --rm -i "${flags[@]}" \
    -v "$root:/workspace${suffix}" \
    -v 6s-test-go-module-cache:/go/pkg/mod \
    -v 6s-test-go-build-cache:/root/.cache/go-build \
    -w /workspace \
    -e CGO_ENABLED=0 \
    "$image" "$binary" "$@"
}

audit_web() {
  if command -v bun >/dev/null 2>&1 && bun audit --help >/dev/null 2>&1; then
    (cd web && bun audit --json)
    return
  fi
  local runtime suffix
  runtime=$(container_runtime)
  if [ -z "$runtime" ]; then
    echo 'bun >=1.4 with `bun audit` required: install it or provide podman/docker to run '"$BUN_IMAGE" >&2
    exit 1
  fi
  suffix=$(runtime_args "$runtime")
  "$runtime" run --rm -i \
    -v "$root/web:/workspace/web${suffix}" \
    -w /workspace/web \
    "$BUN_IMAGE" bun audit --json
}

case "$mode" in
  go)
    run_scanner govulncheck "$GO_DEV_IMAGE" "$GOVULNCHECK_VERSION" -json ./... > artifacts/security/govulncheck.json
    ;;
  web)
    # bun audit exits non-zero on findings; the artifact is still written first.
    if audit_web > artifacts/security/bun-audit.json; then
      :
    else
      status=$?
      echo "Bun audit found vulnerabilities (see artifacts/security/bun-audit.json)" >&2
      exit "$status"
    fi
    ;;
  sbom)
    run_scanner syft "$GO_DEV_IMAGE" "$SYFT_VERSION" dir:. -o 'spdx-json=artifacts/security/sbom.spdx.json'
    ;;
  secrets)
    run_scanner gitleaks "$GO_DEV_IMAGE" "$GITLEAKS_VERSION" git --config .gitleaks.toml --redact --report-format sarif --report-path artifacts/security/gitleaks.sarif
    ;;
  *) echo "unknown scan: $mode" >&2; exit 2 ;;
esac
