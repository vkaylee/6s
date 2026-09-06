DROP INDEX IF EXISTS idx_issues_cause_type;
ALTER TABLE issues DROP COLUMN IF EXISTS cause_type;
