package issue

import (
	"6s/internal/db"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"strconv"
)

// recordConfiguredScore awards a score from the admin-configured rule; a missing
// rule falls back to the safe default and a sign-violating rule awards nothing.
func (s *ServiceImpl) recordConfiguredScore(ctx context.Context, issueID int64, targetType, targetID, ruleKey string, fallback int32, award bool) {
	rule, err := s.store.GetScoringRuleByKey(ctx, ruleKey)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			log.Printf("failed to load scoring rule %s: %v", ruleKey, err)
			return
		}
		rule.Points = fallback
	}
	if (award && rule.Points <= 0) || (!award && rule.Points >= 0) {
		log.Printf("skipping score for rule %s: invalid points %d", ruleKey, rule.Points)
		return
	}
	if scErr := s.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
		IssueID:    issueID,
		TargetType: targetType,
		TargetID:   targetID,
		RuleKey:    ruleKey,
		Points:     rule.Points,
	}); scErr != nil {
		log.Printf("failed to log score %s: %v", ruleKey, scErr)
	}
}

// buildOutboxEntries builds notification outbox rows for both channels with a shared payload.

// buildOutboxEntries builds notification outbox rows for both channels with a shared payload.
func buildOutboxEntries(issueID int64, eventType, category, locCode, reporterName string) []db.CreateOutboxEntryParams {
	payload, err := json.Marshal(map[string]any{"issue_id": issueID, "event_type": eventType, "category": category, "location_code": locCode, "reporter_name": reporterName})
	if err != nil {
		log.Printf("failed to marshal notification: %v", err)
		return nil
	}
	return []db.CreateOutboxEntryParams{
		{IssueID: issueID, EventType: eventType, Channel: "WXPUSHER", Payload: payload},
		{IssueID: issueID, EventType: eventType, Channel: "LAN_WEBHOOK", Payload: payload},
	}
}

func (s *ServiceImpl) queueNotification(ctx context.Context, issueID int64, eventType, category, locCode, reporterName string) {
	for _, entry := range buildOutboxEntries(issueID, eventType, category, locCode, reporterName) {
		if _, err := s.store.CreateOutboxEntry(ctx, entry); err != nil {
			log.Printf("failed to queue %s outbox: %v", entry.Channel, err)
		}
	}
	if s.notifyCh != nil {
		select {
		case s.notifyCh <- struct{}{}:
		default:
		}
	}
}

// ResolveIssueRequest parameters for POST /api/issues/{id}/resolve.

func (s *ServiceImpl) recordCloseReward(ctx context.Context, issue db.Issue, rating int16) {
	rewardKey, fallback := "reward_reporter_normal", int32(2)
	if issue.Category == Category6S.String() {
		rewardKey, fallback = "reward_reporter_safety", int32(5)
	}
	s.recordConfiguredScore(ctx, issue.ID, "USER", strconv.FormatInt(issue.CreatorID, 10), rewardKey, fallback, true)
	if rating >= 4 {
		s.recordConfiguredScore(ctx, issue.ID, "LOCATION", issue.LocationCode, "bonus_kaizen", int32(1), true)
	}
}

// ReopenIssueRequest parameters for POST /api/issues/{id}/reopen.
