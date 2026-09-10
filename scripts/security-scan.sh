#!/usr/bin/env bash
set -euo pipefail

# Pinned scanner tool versions. Keep in lockstep with CI installation step.
: "${GOVULNCHECK_VERSION:=v1.1.4}"
: "${SYFT_VERSION:=v1.18.1}"
: "${GITLEAKS_VERSION:=v8.24.2}"

mode=${1:?usage: $0 {go|web|sbom|secrets}}
mode=${mode%\}}
mkdir -p artifacts/security
case "$mode" in
  go)
    command -v govulncheck >/dev/null || { echo "govulncheck ${GOVULNCHECK_VERSION} required (install golang.org/x/vuln/cmd/govulncheck@${GOVULNCHECK_VERSION})" >&2; exit 1; }
    # govulncheck exits non-zero when vulnerabilities are found; set -e propagates that to CI.
    govulncheck -json ./... > artifacts/security/govulncheck.json
    ;;
  web)
    command -v bun >/dev/null || { echo 'bun required (install https://bun.sh)' >&2; exit 1; }
    # bun audit exits non-zero on findings; set -e propagates that to CI.
    (cd web && bun audit --json) > artifacts/security/bun-audit.json
    ;;
  sbom)
    command -v syft >/dev/null || { echo "syft ${SYFT_VERSION} required (install anchore/syft@${SYFT_VERSION})" >&2; exit 1; }
    syft dir:. -o "spdx-json=artifacts/security/sbom.spdx.json"
    ;;
  secrets)
    command -v gitleaks >/dev/null || { echo "gitleaks ${GITLEAKS_VERSION} required (install gitleaks)" >&2; exit 1; }
    gitleaks git --redact --report-format sarif --report-path artifacts/security/gitleaks.sarif
    ;;
  *) echo "unknown scan: $mode" >&2; exit 2 ;;
esac
