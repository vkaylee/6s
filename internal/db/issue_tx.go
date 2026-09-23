package db

import (
	"context"
	"database/sql"
	"fmt"
)

// PatchIssueWithTagsAtomic commits an issue patch and full tag replacement together.
func (q *Queries) PatchIssueWithTagsAtomic(ctx context.Context, patch PatchIssueParams, tags []string) (Issue, error) {
	return q.patchIssueWithAuditAtomic(ctx, patch, tags, nil, nil)
}

// PatchIssueWithProposedTagsAtomic also upserts and links creator-owned pending tags atomically.
func (q *Queries) PatchIssueWithProposedTagsAtomic(ctx context.Context, patch PatchIssueParams, tags []string, proposed []UpsertProposedTagParams) (Issue, error) {
	return q.patchIssueWithAuditAtomic(ctx, patch, tags, proposed, nil)
}

// PatchIssueWithAuditAtomic commits an issue patch, full tag replacement, and audit rows together.
// A nil or empty audit slice skips audit writes; any failure rolls the entire mutation back so a
// responsibility transfer can never be persisted without its history.
func (q *Queries) PatchIssueWithAuditAtomic(ctx context.Context, patch PatchIssueParams, tags []string, audit []InsertAuditLogParams) (Issue, error) {
	return q.patchIssueWithAuditAtomic(ctx, patch, tags, nil, audit)
}

func (q *Queries) patchIssueWithAuditAtomic(ctx context.Context, patch PatchIssueParams, tags []string, proposed []UpsertProposedTagParams, audit []InsertAuditLogParams) (Issue, error) {
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
	if tags != nil || proposed != nil {
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
		for _, proposal := range proposed {
			tag, err := txQueries.UpsertProposedTag(ctx, proposal)
			if err != nil {
				return rollback(fmt.Errorf("upsert proposed tag: %w", err))
			}
			if err := txQueries.InsertIssueTag(ctx, InsertIssueTagParams{IssueID: patch.ID, TagCode: tag.Code}); err != nil {
				return rollback(fmt.Errorf("insert proposed issue tag: %w", err))
			}
		}
	}
	for _, entry := range audit {
		if err := txQueries.InsertAuditLog(ctx, entry); err != nil {
			return rollback(fmt.Errorf("insert issue audit: %w", err))
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
	return q.createIssueAtomic(ctx, issueParams, tags, nil, buildOutbox, buildScores)
}

// CreateIssueWithProposedTags additionally persists creator-owned pending tags and links them to
// the issue in the same transaction, so a proposal can never exist without its issue or vice versa.
func (q *Queries) CreateIssueWithProposedTags(
	ctx context.Context,
	issueParams CreateIssueParams,
	tags []string,
	proposed []UpsertProposedTagParams,
	buildOutbox func(issueID int64) []CreateOutboxEntryParams,
	buildScores func(issueID int64) []InsertScoreLogParams,
) (Issue, error) {
	return q.createIssueAtomic(ctx, issueParams, tags, proposed, buildOutbox, buildScores)
}

func (q *Queries) createIssueAtomic(
	ctx context.Context,
	issueParams CreateIssueParams,
	tags []string,
	proposed []UpsertProposedTagParams,
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
	for _, proposal := range proposed {
		tag, err := txQueries.UpsertProposedTag(ctx, proposal)
		if err != nil {
			return rollback(fmt.Errorf("upsert proposed tag: %w", err))
		}
		if err := txQueries.InsertIssueTag(ctx, InsertIssueTagParams{IssueID: created.ID, TagCode: tag.Code}); err != nil {
			return rollback(fmt.Errorf("insert proposed issue tag: %w", err))
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

// MergeTagAtomic merges a source tag into a target tag inside one transaction.
// It removes duplicate issue-tag associations, reassigns remaining associations to the target tag,
// and updates the source tag status to MERGED with merged_tag_code pointing to target.
func (q *Queries) MergeTagAtomic(ctx context.Context, sourceCode, targetCode string, reviewerID int64) (Tag, error) {
	if sourceCode == targetCode {
		return Tag{}, fmt.Errorf("cannot merge tag into itself")
	}
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return Tag{}, fmt.Errorf("database does not support transactions")
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return Tag{}, fmt.Errorf("begin tag merge transaction: %w", err)
	}
	rollback := func(cause error) (Tag, error) {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return Tag{}, fmt.Errorf("%w; rollback tag merge: %v", cause, rollbackErr)
		}
		return Tag{}, cause
	}
	txQueries := q.WithTx(tx)

	target, err := txQueries.GetTagByCode(ctx, targetCode)
	if err != nil {
		return rollback(fmt.Errorf("target tag not found: %w", err))
	}
	if target.Status != "APPROVED" {
		return rollback(fmt.Errorf("target tag must be approved"))
	}

	if err := txQueries.MergeTagIssuesDeduplicate(ctx, MergeTagIssuesDeduplicateParams{
		TagCode:   sourceCode,
		TagCode_2: targetCode,
	}); err != nil {
		return rollback(fmt.Errorf("deduplicate merged tag issues: %w", err))
	}

	if err := txQueries.MergeTagIssuesReassign(ctx, MergeTagIssuesReassignParams{
		TagCode:   sourceCode,
		TagCode_2: targetCode,
	}); err != nil {
		return rollback(fmt.Errorf("reassign merged tag issues: %w", err))
	}

	merged, err := txQueries.MergeTagRecord(ctx, MergeTagRecordParams{
		Code:          sourceCode,
		MergedTagCode: sql.NullString{String: targetCode, Valid: true},
		ReviewedBy:    sql.NullInt64{Int64: reviewerID, Valid: reviewerID > 0},
	})
	if err != nil {
		return rollback(fmt.Errorf("update merged tag record: %w", err))
	}

	if err := tx.Commit(); err != nil {
		return Tag{}, fmt.Errorf("commit tag merge: %w", err)
	}
	return merged, nil
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
