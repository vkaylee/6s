# Target
Own scoring logic in `internal/issue/service.go`, related config/query code, seed/default data, and scoring tests. Do not edit shared startup/auth/frontend files.

# Change
Replace hardcoded reward/penalty/bonus values with `scoring_rules` reads. Preserve safe defaults and define behavior when a rule is missing or invalid. Keep transaction and optimistic-lock behavior unchanged. Test that admin-configured values affect lifecycle scoring and failures do not silently award points.

# Acceptance
No lifecycle path bypasses configured rules. Existing defaults remain compatible. Tests cover configured, missing, invalid values. Commit owned files only.