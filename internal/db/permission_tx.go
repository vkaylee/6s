package db

import (
	"context"
	"database/sql"
	"fmt"
)

// ReplaceRolePermissionsAndAudit atomically replaces a role's grants and records the audit event.
func (q *Queries) ReplaceRolePermissionsAndAudit(ctx context.Context, replace ReplaceRolePermissionsParams, audit InsertAuditLogParams) error {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return fmt.Errorf("database does not support transactions")
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin permission update transaction: %w", err)
	}
	rollback := func(cause error) error {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return fmt.Errorf("%w; rollback permission update: %v", cause, rollbackErr)
		}
		return cause
	}

	txQueries := q.WithTx(tx)
	if err := txQueries.ReplaceRolePermissions(ctx, replace); err != nil {
		return rollback(fmt.Errorf("replace role permissions: %w", err))
	}
	if err := txQueries.InsertAuditLog(ctx, audit); err != nil {
		return rollback(fmt.Errorf("insert permission audit: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit permission update: %w", err)
	}
	return nil
}
