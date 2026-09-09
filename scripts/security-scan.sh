#!/usr/bin/env bash
set -euo pipefail

mode=${1:?usage: $0 {go|web|sbom|secrets}}
mode=${mode%\}}
mkdir -p artifacts/security
case "$mode" in
  go)
    command -v govulncheck >/dev/null || { echo 'govulncheck required (install golang.org/x/vuln/cmd/govulncheck)' >&2; exit 1; }
    govulncheck -json ./... > artifacts/security/govulncheck.json
    ;;
  web)
    command -v bun >/dev/null || { echo 'bun required (install https://bun.sh)' >&2; exit 1; }
    (cd web && bun audit --json) > artifacts/security/bun-audit.json
    ;;
  sbom)
    command -v syft >/dev/null || { echo 'syft required (install anchore/syft)' >&2; exit 1; }
    syft dir:. -o "spdx-json=artifacts/security/sbom.spdx.json"
    ;;
  secrets)
    command -v gitleaks >/dev/null || { echo 'gitleaks required (install gitleaks)' >&2; exit 1; }
    gitleaks git --redact --report-format sarif --report-path artifacts/security/gitleaks.sarif
    ;;
  *) echo "unknown scan: $mode" >&2; exit 2 ;;
esac
