package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"6s/internal/apperror"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

type contextKey string

const (
	// UserContextKey is the context key for authenticated db.User.
	UserContextKey contextKey = "auth_user"
)

// UserGetter retrieves a user by ID.
type UserGetter interface {
	GetUserByID(ctx context.Context, id int64) (db.User, error)
}

// Middleware handles authentication and authorization.
type Middleware struct {
	tokenManager *TokenManager
	userGetter   UserGetter
}

// NewMiddleware instantiates auth Middleware.
func NewMiddleware(tokenManager *TokenManager, userGetter UserGetter) *Middleware {
	return &Middleware{
		tokenManager: tokenManager,
		userGetter:   userGetter,
	}
}

// Authenticate extracts Bearer JWT token, validates it, fetches the user from DB,
// and puts the user model into request context.
func (m *Middleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			response.AppError(w, r, apperror.Unauthorized(i18n.ErrMissingAuth))
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			response.AppError(w, r, apperror.Unauthorized(i18n.ErrInvalidAuthFmt))
			return
		}

		tokenStr := strings.TrimSpace(parts[1])
		userID, err := m.tokenManager.ValidateAccessToken(tokenStr)
		if err != nil {
			response.AppError(w, r, apperror.Unauthorized(i18n.ErrInvalidToken).WithCause(err))
			return
		}

		user, err := m.userGetter.GetUserByID(r.Context(), userID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				response.AppError(w, r, apperror.Unauthorized(i18n.ErrUserNotFound))
				return
			}
			response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
			return
		}

		if !user.IsActive {
			response.AppError(w, r, apperror.Forbidden(i18n.ErrAccountLocked))
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserFromContext retrieves authenticated db.User from context.
func GetUserFromContext(ctx context.Context) (db.User, bool) {
	user, ok := ctx.Value(UserContextKey).(db.User)
	return user, ok
}

// RequireRole checks if the authenticated user has at least one of the allowed roles.
func RequireRole(allowedRoles ...Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := GetUserFromContext(r.Context())
			if !ok {
				response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
				return
			}

			for _, role := range allowedRoles {
				if user.Role == role.String() {
					next.ServeHTTP(w, r)
					return
				}
			}
			response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
		})
	}
}
