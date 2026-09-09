package db

import (
	"context"
	"database/sql"
	"fmt"
)

// GetRefreshTokenByHashAnyState returns a refresh token even after revocation,
// allowing callers to detect reuse of rotated credentials.
func (q *Queries) GetRefreshTokenByHashAnyState(ctx context.Context, tokenHash string) (RefreshToken, error) {
	row := q.db.QueryRowContext(ctx, `SELECT id, user_id, token_hash, device_info, expires_at, revoked_at, created_at FROM refresh_tokens WHERE token_hash = $1`, tokenHash)
	var t RefreshToken
	err := row.Scan(&t.ID, &t.UserID, &t.TokenHash, &t.DeviceInfo, &t.ExpiresAt, &t.RevokedAt, &t.CreatedAt)
	return t, err
}

// RotateRefreshToken revokes the old token and inserts its successor in one transaction.
func (q *Queries) RotateRefreshToken(ctx context.Context, oldID int64, arg CreateRefreshTokenParams) error {
	beginner, ok := q.db.(interface {
		BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
	})
	if !ok {
		return fmt.Errorf("database does not support transactions")
	}
	tx, err := beginner.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin refresh token rotation: %w", err)
	}
	rollback := func(cause error) error {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			return fmt.Errorf("%w; rollback refresh token rotation: %v", cause, rollbackErr)
		}
		return cause
	}
	result, err := tx.ExecContext(ctx, `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL`, oldID)
	if err != nil {
		return rollback(fmt.Errorf("revoke refresh token: %w", err))
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return rollback(fmt.Errorf("check revoked refresh token: %w", err))
	}
	if changed != 1 {
		return rollback(sql.ErrNoRows)
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at) VALUES ($1, $2, $3, $4)`, arg.UserID, arg.TokenHash, arg.DeviceInfo, arg.ExpiresAt); err != nil {
		return rollback(fmt.Errorf("create refresh token: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit refresh token rotation: %w", err)
	}
	return nil
}
