# Location Search Ranking

Status: Approved

## Goal
Make location search behave like tag search: accent-insensitive, token-aware, typo-tolerant, and ranked without changing the location data contract or modal UI.

## Constraints and Interfaces
- Keep `LocationCombobox` props and `LocationItem` unchanged.
- Preserve recent-location display and existing mobile keyboard/layout fixes.
- Do not add dependencies or alter API/database schemas.
- Reuse one search implementation; avoid a second location-only fuzzy algorithm.
- Location records have no `use_count`; ranking must use match quality, then original order.

## Tasks
- [x] Extract reusable normalized text and ranked record-search primitives from `web/src/utils/tagSearch.ts`; preserve existing `searchTags()` output and tie-breaking behavior.
- [x] Add location search adapter/record fields for `code`, `name_vi`, `name_en`, and `name_zh`; rank exact code above exact names, prefixes, token matches, substrings, and small typos.
- [x] Update `web/src/components/LocationCombobox.tsx` to call ranked location search and keep recent locations pinned ahead of the ranked all-location list without duplicate entries.
- [x] Add regression coverage in `web/test/tagSearch.test.ts` and `web/test/locationCombobox.test.tsx` for accent removal, multilingual fields, token order, exact-code priority, typo tolerance, no-match behavior, and stable ties.
- [x] Run `./leedevkit test web --unit-only` and `./leedevkit test web --lint-only`; manually verify mobile open state shows the location list before search focus and desktop search still focuses normally.

## Done When
- [x] Location search returns ranked results using the same matching rules as tags.
- [x] Recent locations remain first only when the query is empty or the result matches them; all other results follow relevance ranking.
- [x] Existing tag-search tests and location UI tests pass.
- [x] Web unit and lint checks pass.

## Review Focus
- Avoid changing tag ranking accidentally while extracting shared code.
- Keep fuzzy matching bounded to prevent unrelated locations from matching short queries.
- Ensure recent entries do not render twice.
- Ensure SSR/test environments do not require browser APIs.
