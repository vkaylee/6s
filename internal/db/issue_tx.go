package db

import (
	"context"
	"database/sql"
	"fmt"
)

// PatchIssueWithTagsAtomic commits an issue patch and full tag replacement together.
func (q *Queries) PatchIssueWithTagsAtomic(ctx context.Context, patch PatchIssueParams, tags []string) (Issue, error) {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return Issue{}, fmt.Errorf("database does not support transactions")
	}

	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return Issue{}, fmt.Errorf("begin issue patch transaction: %w", err)
	}
	rollback := func(cause error) (Issue, error) {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return Issue{}, fmt.Errorf("%w; rollback issue patch: %v", cause, rollbackErr)
		}
		return Issue{}, cause
	}

	txQueries := q.WithTx(tx)
	updated, err := txQueries.PatchIssue(ctx, patch)
	if err != nil {
		return rollback(fmt.Errorf("patch issue: %w", err))
	}
	if err := txQueries.DeleteIssueTags(ctx, patch.ID); err != nil {
		return rollback(fmt.Errorf("delete issue tags: %w", err))
	}
	for _, tag := range tags {
		if tag == "" {
			continue
		}
		if err := txQueries.InsertIssueTag(ctx, InsertIssueTagParams{IssueID: patch.ID, TagCode: tag}); err != nil {
			return rollback(fmt.Errorf("insert issue tag: %w", err))
		}
	}
	if err := tx.Commit(); err != nil {
		return Issue{}, fmt.Errorf("commit issue patch: %w", err)
	}
	return updated, nil
}
