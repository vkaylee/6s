package db

import "context"

// GetIssueResponsibilityHistory is the issue service name for the generated history query.
func (q *Queries) GetIssueResponsibilityHistory(ctx context.Context, targetID string) ([]ListIssueResponsibilityHistoryRow, error) {
	return q.ListIssueResponsibilityHistory(ctx, targetID)
}
