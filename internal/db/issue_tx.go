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

// CreateIssueWithSideEffects commits issue creation and all durable side effects together.
// buildOutbox receives the created issue and returns outbox rows with payloads bound to that ID.
// buildScores receives the created issue and returns score rows bound to that ID.
func (q *Queries) CreateIssueWithSideEffects(
	ctx context.Context,
	issueParams CreateIssueParams,
	tags []string,
	buildOutbox func(issueID int64) []CreateOutboxEntryParams,
	buildScores func(issueID int64) []InsertScoreLogParams,
) (Issue, error) {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return Issue{}, fmt.Errorf("database does not support transactions")
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return Issue{}, fmt.Errorf("begin issue creation transaction: %w", err)
	}
	rollback := func(cause error) (Issue, error) {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return Issue{}, fmt.Errorf("%w; rollback issue creation: %v", cause, rollbackErr)
		}
		return Issue{}, cause
	}
	txQueries := q.WithTx(tx)
	created, err := txQueries.CreateIssue(ctx, issueParams)
	if err != nil {
		return rollback(fmt.Errorf("create issue: %w", err))
	}
	for _, tag := range tags {
		if tag == "" {
			continue
		}
		if err := txQueries.InsertIssueTag(ctx, InsertIssueTagParams{IssueID: created.ID, TagCode: tag}); err != nil {
			return rollback(fmt.Errorf("insert issue tag: %w", err))
		}
		if err := txQueries.IncrementTagUseCount(ctx, tag); err != nil {
			return rollback(fmt.Errorf("increment tag use count: %w", err))
		}
	}
	if buildOutbox != nil {
		for _, entry := range buildOutbox(created.ID) {
			if _, err := txQueries.CreateOutboxEntry(ctx, entry); err != nil {
				return rollback(fmt.Errorf("create notification outbox: %w", err))
			}
		}
	}
	if buildScores != nil {
		for _, score := range buildScores(created.ID) {
			if err := txQueries.InsertScoreLog(ctx, score); err != nil {
				return rollback(fmt.Errorf("insert score log: %w", err))
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return Issue{}, fmt.Errorf("commit issue creation: %w", err)
	}
	return created, nil
}

// ResolveIssueAtomic commits a normal or forced issue resolution in one transaction.
func (q *Queries) ResolveIssueAtomic(ctx context.Context, force bool, params ResolveIssueParams, forceParams ForceResolveIssueParams) (Issue, error) {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return Issue{}, fmt.Errorf("database does not support transactions")
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return Issue{}, fmt.Errorf("begin issue resolution transaction: %w", err)
	}
	rollback := func(cause error) (Issue, error) {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return Issue{}, fmt.Errorf("%w; rollback issue resolution: %v", cause, rollbackErr)
		}
		return Issue{}, cause
	}
	txQueries := q.WithTx(tx)
	var updated Issue
	if force {
		updated, err = txQueries.ForceResolveIssue(ctx, forceParams)
	} else {
		updated, err = txQueries.ResolveIssue(ctx, params)
	}
	if err != nil {
		return rollback(fmt.Errorf("resolve issue: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return Issue{}, fmt.Errorf("commit issue resolution: %w", err)
	}
	return updated, nil
}
