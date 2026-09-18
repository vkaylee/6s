package db

import (
	"context"
	"database/sql"
	"fmt"
)

// AddTeamMembershipWithAudit atomically adds a member and records the membership audit row.
func (q *Queries) AddTeamMembershipWithAudit(ctx context.Context, membership AddTeamMembershipParams, audit InsertAuditLogParams) error {
	return q.teamMembershipWithAudit(ctx, func(txq *Queries) error {
		return txq.AddTeamMembership(ctx, membership)
	}, audit)
}

// DeleteTeamMembershipWithAudit atomically removes a member and records the membership audit row.
func (q *Queries) DeleteTeamMembershipWithAudit(ctx context.Context, membership DeleteTeamMembershipParams, audit InsertAuditLogParams) error {
	return q.teamMembershipWithAudit(ctx, func(txq *Queries) error {
		return txq.DeleteTeamMembership(ctx, membership)
	}, audit)
}

func (q *Queries) teamMembershipWithAudit(ctx context.Context, mutation func(*Queries) error, audit InsertAuditLogParams) error {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return fmt.Errorf("database does not support transactions")
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin team membership transaction: %w", err)
	}
	rollback := func(cause error) error {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return fmt.Errorf("%w; rollback team membership: %v", cause, rollbackErr)
		}
		return cause
	}
	txq := q.WithTx(tx)
	if err := mutation(txq); err != nil {
		return rollback(fmt.Errorf("mutate team membership: %w", err))
	}
	if err := txq.InsertAuditLog(ctx, audit); err != nil {
		return rollback(fmt.Errorf("audit team membership: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit team membership: %w", err)
	}
	return nil
}
