INSERT INTO scoring_rules (rule_key, points, description) VALUES
('base_weekly_score', 100, 'Weekly starting score'),
('penalty_normal', -2, 'Normal issue penalty'),
('penalty_safety', -10, 'Safety issue penalty'),
('penalty_overdue', -5, 'Daily overdue issue penalty'),
('penalty_reopen', -2, 'Reopened issue penalty'),
('bonus_kaizen', 1, 'High-rating closure bonus'),
('reward_reporter_normal', 2, 'Normal issue reporter reward'),
('reward_reporter_safety', 5, 'Safety issue reporter reward'),
('penalty_reporter_invalid', -2, 'Invalid issue reporter penalty')
ON CONFLICT (rule_key) DO NOTHING;
