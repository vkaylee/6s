ALTER TABLE issues ADD COLUMN IF NOT EXISTS cause_type VARCHAR(20) NOT NULL DEFAULT 'CONDITION' CHECK (cause_type IN ('CONDITION', 'BEHAVIOR'));
UPDATE issues SET cause_type = 'BEHAVIOR' WHERE category = '5S';
CREATE INDEX IF NOT EXISTS idx_issues_cause_type ON issues(cause_type);
