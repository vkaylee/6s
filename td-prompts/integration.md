# Target
Integrate candidate commits into one validation branch. Do not merge into `master`. Create branch from `80c37d4`; preserve the unrelated root `admin-page-split.md` conceptually (it is implemented by `f2c9c18`).

# Change
Cherry-pick in this exact order, resolving only intended conflicts and preserving behavior:
1. `f30a429` security config
2. `71ab9ac` auth hardening
3. `04b0bf8` migrations/readiness
4. `1ab6dc4` DB performance
5. `b147adf` scoring
6. `45695e0` observability
7. `6ae89bd`, then `8b35b7e` CI
8. `7726dcb` API contract
9. `6f9a9d5` i18n
10. `7204151` accessibility
11. `f2c9c18` admin pages

Resolve conflicts by source-of-truth rules: generated files only from OpenAPI/SQL source; API transport must retain generated client; i18n must retain locale-neutral API error codes plus UI translation; preserve a11y rule enablement; `main.go` must combine startup validation, readiness, and observability. Never silently drop a security change. Do not cherry-pick unrelated commits.

# Acceptance
Run `git diff --check`; inspect all conflict resolutions; run available focused server/web checks. Record every blocked command exactly (missing tools/assets). Report resulting commit range, conflicts/resolutions, failing tests, and whether `td/frontend-architecture` and `td/test-quality-docs` are now unblocked. Do not push or merge `master`.