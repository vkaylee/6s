package db

import (
	"context"
	"database/sql"
	"fmt"
)

// UpdateUserAdminAtomic commits the user mutation, session revocation, and audit together.
func (q *Queries) UpdateUserAdminAtomic(ctx context.Context, update UpdateUserAdminParams, revoke bool, audit InsertAuditLogParams) (User, error) {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return User{}, fmt.Errorf("database does not support transactions")
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return User{}, fmt.Errorf("begin user update transaction: %w", err)
	}
	rollback := func(cause error) (User, error) {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return User{}, fmt.Errorf("%w; rollback user update: %v", cause, rollbackErr)
		}
		return User{}, cause
	}
	txQueries := q.WithTx(tx)
	updated, err := txQueries.UpdateUserAdmin(ctx, update)
	if err != nil {
		return rollback(fmt.Errorf("update user: %w", err))
	}
	if revoke {
		if err := txQueries.RevokeUserRefreshTokens(ctx, update.ID); err != nil {
			return rollback(fmt.Errorf("revoke user sessions: %w", err))
		}
	}
	if err := txQueries.InsertAuditLog(ctx, audit); err != nil {
		return rollback(fmt.Errorf("insert user audit: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return User{}, fmt.Errorf("commit user update: %w", err)
	}
	return updated, nil
}
