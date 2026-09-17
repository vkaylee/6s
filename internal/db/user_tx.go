package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ErrSetupAlreadyInitialized indicates that an active admin already exists.
var ErrSetupAlreadyInitialized = errors.New("setup already initialized")

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

// CreateLocalAdminAtomic serializes initial superadmin bootstrap across
// processes with a transaction-scoped advisory lock. PostgreSQL releases lock
// automatically when transaction commits, rolls back, or is canceled.
func (q *Queries) CreateLocalAdminAtomic(ctx context.Context, arg CreateLocalAdminParams) (User, error) {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return User{}, fmt.Errorf("database does not support transactions")
	}
	// READ COMMITTED is explicit by contract: the post-lock count query must see
	// the committed row of whichever bootstrap won the advisory lock.
	tx, err := beginner.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return User{}, fmt.Errorf("begin setup transaction: %w", err)
	}
	rollback := func(cause error) (User, error) {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return User{}, fmt.Errorf("%w; rollback setup: %v", cause, rollbackErr)
		}
		return User{}, cause
	}
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('6s initial superadmin setup', 0))`); err != nil {
		return rollback(fmt.Errorf("acquire setup lock: %w", err))
	}
	txQueries := q.WithTx(tx)
	count, err := txQueries.CountAdmins(ctx)
	if err != nil {
		return rollback(fmt.Errorf("count admins: %w", err))
	}
	if count > 0 {
		return rollback(ErrSetupAlreadyInitialized)
	}
	user, err := txQueries.CreateLocalAdmin(ctx, arg)
	if err != nil {
		return rollback(fmt.Errorf("create local admin: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return User{}, fmt.Errorf("commit setup: %w", err)
	}
	return user, nil
}
