# Sprint 3 — i18n, accessibility, CI, E2E

## Mục tiêu
Dọn nợ user-facing và nâng độ tin cậy của pipeline; chỉ giữ test bảo vệ hành vi thực.

## Phạm vi

- [x] **i18n và `lang` metadata** — `web/src/i18n/`, `web/src/pages/`, locale `vi/en/zh`
  - Locale parity verified: 644 keys, all values non-empty.
  - `document.documentElement.lang` initialized from detected locale and updated on change.
- [x] **Accessibility modal/control** — các modal/drawer đã phát hiện
  - Added translated labels, dialog semantics, focus trap/restore, Escape handling.
  - Split slider supports keyboard arrows/Home/End.
- [x] **CI production build và supply chain** — `.github/workflows/ci.yml`, `scripts/security-scan.sh`
  - CI runs production web build before lint/tests.
  - GitHub Actions and scanner versions pinned; scanner failures remain non-zero.
  - No image scan added because CI does not publish an image.
- [x] **E2E thực chất** — `web/e2e/`, `.compose/`, Playwright config
  - Real Chromium container, isolated disposable DB, readiness polling.
  - Login, Reports, CSV export, token refresh, 403, image zoom flows pass.

## Verification

```sh
./leedevkit test web --e2e-only
./leedevkit test all
```

Evidence: `./leedevkit test web --e2e-only` passed 5/5; `./leedevkit test all` passed server unit/integration/lint plus web unit/E2E/lint. Build, typecheck, locale parity, and scanner syntax verified.

## Done when

- [x] Ba locale parity; UI đạt accessibility scope.
- [x] Production build và security gates chạy được trong CI.
- [x] E2E mở Chromium thật, tương tác React app thật, kiểm tra được export.
