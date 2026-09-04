# Master Plan: 6S Issue Management System

## Goal
Xây dựng hệ thống 6S mobile-first Go + React PWA offline-resilient, transactional outbox và RBAC 4 cấp.

## Domain Roadmap
1. [x] Domain 1: Backend Core & DB (`plan-backend-core.md`)
2. [x] Domain 2: Auth & Identity (`plan-auth-rbac.md`)
3. [x] Domain 3: Issues Engine & Storage (`plan-issues-storage.md`)
4. [x] Domain 4: Scoring & Outbox Worker (`plan-scoring-cron.md`)
5. [x] Domain 5: PWA Offline Engine (`plan-pwa-offline.md`)
6. [x] Domain 6: PWA Industrial UI (`plan-pwa-ui.md`)
7. [ ] Verification & Binary Embed (`plan-verification.md`)

## Done When
- [ ] Backend Go pass toàn bộ test suite (`./leedevkit test server --unit-only`)
- [ ] Web PWA pass build và lint (`./leedevkit test web --lint-only`)
- [ ] Binary duy nhất nhúng PWA serve HTTPS trên mạng LAN
