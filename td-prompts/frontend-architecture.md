# Target
Own `web/src/App.tsx` and newly extracted existing-feature modules/hooks only. Start after API, i18n, and a11y branches are merged/rebased. Do not change backend contracts, locale schemas, or accessibility primitives.

# Change
Reduce App orchestration by extracting cohesive existing feature boundaries. Remove duplicated manual types/state and eliminate `DEFAULT_TAGS` as server master data where contract supports it. Preserve routes, auth guards, SSE/ticket behavior, offline sync, loading/error states. Do not create speculative factories/interfaces or a new component library.

# Acceptance
App is materially smaller without behavior change. Existing route and state transition tests pass. No duplicated Tag/Issue contract remains. Add only behavior regression coverage for extracted boundary. Commit owned frontend files.