#!/usr/bin/env bash
set -euo pipefail

mode=${1:?usage: $0 {go|web|sbom|secrets}}
mkdir -p artifacts/security
case "$mode" in
  go)
    command -v govulncheck >/dev/null || { echo 'govulncheck required' >&2; exit 1; }
    govulncheck -json ./... > artifacts/security/govulncheck.json
    ;;
  web)
    command -v bun >/dev/null || { echo 'bun required' >&2; exit 1; }
    (cd web && bun audit --json) > artifacts/security/bun-audit.json
    ;;
  sbom)
    command -v syft >/dev/null || { echo 'syft required' >&2; exit 1; }
    syft dir:. -o spdx-json=artifacts/security/sbom.spdx.json
    ;;
  secrets)
    command -v gitleaks >/dev/null || { echo 'gitleaks required' >&2; exit 1; }
    gitleaks git --redact --report-format sarif --report-path artifacts/security/gitleaks.sarif
    ;;
  *) echo "unknown scan: $mode" >&2; exit 2 ;;
esac
