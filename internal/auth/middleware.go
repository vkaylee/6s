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
	tokenManager     *TokenManager
	ticketManager    *TicketManager
	userGetter       UserGetter
	permissionGetter PermissionGetter
}

// NewMiddleware instantiates auth Middleware.
func NewMiddleware(tokenManager *TokenManager, userGetter UserGetter, ticketManager ...*TicketManager) *Middleware {
	var tm *TicketManager
	if len(ticketManager) > 0 {
		tm = ticketManager[0]
	}
	var permissionGetter PermissionGetter
	if getter, ok := userGetter.(PermissionGetter); ok {
		permissionGetter = getter
	}
	return &Middleware{
		tokenManager: tokenManager, ticketManager: tm, userGetter: userGetter,
		permissionGetter: permissionGetter,
	}
}

func (m *Middleware) extractUserID(r *http.Request) (int64, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return 0, apperror.Unauthorized(i18n.ErrInvalidAuthFmt)
		}
		userID, err := m.tokenManager.ValidateAccessToken(strings.TrimSpace(parts[1]))
		if err != nil {
			return 0, apperror.Unauthorized(i18n.ErrInvalidToken).WithCause(err)
		}
		return userID, nil
	}

	if qTicket := strings.TrimSpace(r.URL.Query().Get("ticket")); qTicket != "" && m.ticketManager != nil {
		userID, err := m.ticketManager.Consume(qTicket)
		if err != nil {
			return 0, apperror.Unauthorized(i18n.ErrInvalidToken).WithCause(err)
		}
		return userID, nil
	}

	return 0, apperror.Unauthorized(i18n.ErrMissingAuth)
}

// Authenticate extracts Bearer JWT token, validates it, fetches the user from DB,
// and puts the user model into request context.
func (m *Middleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, err := m.extractUserID(r)
		if err != nil {
			var appErr *apperror.AppError
			if errors.As(err, &appErr) {
				_ = response.AppError(w, r, appErr)
			} else {
				_ = response.AppError(w, r, apperror.Unauthorized(i18n.ErrInvalidToken).WithCause(err))
			}
			return
		}
		user, err := m.userGetter.GetUserByID(r.Context(), userID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				_ = response.AppError(w, r, apperror.Unauthorized(i18n.ErrUserNotFound))
				return
			}
			_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
			return
		}

		if !user.IsActive {
			_ = response.AppError(w, r, apperror.Forbidden(i18n.ErrAccountLocked))
			return
		}

		ctx := r.Context()
		if m.permissionGetter != nil {
			permissions, err := m.permissionGetter.GetUserPermissions(ctx, user.ID)
			if err != nil {
				_ = response.AppError(w, r, apperror.Internal(i18n.ErrUserQuery).WithCause(err))
				return
			}
			ctx = WithPermissions(ctx, permissions)
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(ctx, UserContextKey, user)))
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
				_ = response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
				return
			}

			for _, role := range allowedRoles {
				if user.Role == role.String() {
					next.ServeHTTP(w, r)
					return
				}
			}
			_ = response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
		})
	}
}
