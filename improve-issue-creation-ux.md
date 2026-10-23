# Improve issue creation UX

Status: Complete

## Goal
Make issue creation follow evidence photo → location → short description → AI category/tag suggestions → user confirmation and submit.

## Constraints and interfaces
- Reuse existing photo, location, description, taxonomy, draft, sync, and `suggestTags` flows; no new AI endpoint.
- Evidence overview photo remains required; detail photo remains optional.
- Location remains required; description remains optional.
- AI runs only from an explicit action after a location is selected and description is non-empty.
- AI suggestions never overwrite manual category or tag choices. Empty category may adopt the first valid AI category; empty tags may adopt matching existing tags. Proposed tags use existing pending-tag handling.
- DOM and keyboard reading order MUST match the requested sequence on mobile and desktop: evidence → location → description → suggestions/review → submit.
- Preserve i18n, accessibility, mobile layout, existing validation, draft persistence, and sync behavior.

## Tasks
- [x] Reorder create-issue sections to evidence photo, location, description, then AI category/tag suggestions and confirmation/submit.
- [x] Keep the submit area after taxonomy review and make the final confirmation state clear without changing submission contracts.
- [x] Keep the explicit AI suggestion action beside the description and pass description context into the existing suggestion endpoint.
- [x] Apply suggestions only to empty taxonomy fields; render loading, error, and result states while keeping manual edits available.
- [x] Add focused tests for DOM/step order, request payload, empty-field application, preservation of manual values, validation, and AI failure.
- [x] Run focused tests, web lint/unit checks, server checks if backend changes, and the full suite.

## Done when
- [x] User sees and can operate the flow in this order: evidence photo → location → short description → AI category/tags → confirmation and submit.
- [x] AI suggestion button appears after the description and performs one request with description context.
- [x] Empty category/tags receive suggestions; existing manual values remain unchanged.
- [x] Submit remains available only through the existing validation rules and confirmation state.
- [x] Existing photo, location, draft, sync, i18n, accessibility, and submission behavior remain intact.
