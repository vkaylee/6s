# OpenAPI-generated client migration

## Decision
Use `@hey-api/openapi-ts` as a dev-only generator. Generate a typed TypeScript client from `openapi.yaml` into `web/src/api/generated/`. Keep the existing `fetch` transport, auth refresh, locale header, error envelope, and offline behavior in `web/src/api/client.ts`; generated functions receive the shared client instance. No runtime dependency added beyond the generated code required by the selected generator.

## Scope
1. Validate `openapi.yaml` in CI.
2. Generate the client reproducibly from the repository contract.
3. Migrate all frontend API calls to generated operation functions, starting with issue mutations.
4. Remove hand-written paths/methods where generated operations replace them.
5. Add a contract test proving operation method/path/body for close, reopen, invalidate, resolve, and sync.
6. Run web unit/lint plus OpenAPI validation.

## Sequence
1. Verify generator availability/version; add only the smallest required dev dependency or use a pinned local CLI.
2. Fix contract drift first: routes currently used by frontend but absent from `openapi.yaml` (AI endpoints, notification test, admin users, setup status/ticket as applicable).
3. Add generation script and checked-in generated output, or document a deterministic ignored-output strategy; prefer checked-in output for offline builds.
4. Add shared generated-client transport adapter around existing auth/error handling.
5. Migrate calls incrementally; preserve response envelope unwrapping and offline multipart uploads.
6. Delete obsolete manual request construction.
7. Add CI gate: validate spec, regenerate, fail on diff, then web lint/unit tests.

## Gates
- OpenAPI parser/linter passes.
- Generated output reproducible with pinned tool version.
- No frontend request uses an undeclared path/method.
- Mutation bodies match schema.
- Auth, locale, 401 refresh, error mapping, multipart uploads preserved.
- `./leedevkit test web --unit-only` and `./leedevkit test web --lint-only` pass.

## Explicit non-goals
No API redesign, no backend behavior changes, no new retry/idempotency layer, no broad type cleanup.