DELETE FROM scoring_rules
WHERE rule_key IN (
    'base_weekly_score',
    'penalty_normal',
    'penalty_safety',
    'penalty_overdue',
    'penalty_reopen',
    'bonus_kaizen',
    'reward_reporter_normal',
    'reward_reporter_safety',
    'penalty_reporter_invalid'
);
