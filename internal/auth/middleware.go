package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"6s/internal/db"
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
			response.Unauthorized(w, "Thiếu header Authorization")
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			response.Unauthorized(w, "Định dạng header Authorization không hợp lệ (cần Bearer <token>)")
			return
		}

		tokenStr := strings.TrimSpace(parts[1])
		userID, err := m.tokenManager.ValidateAccessToken(tokenStr)
		if err != nil {
			response.Unauthorized(w, "Access token không hợp lệ hoặc đã hết hạn")
			return
		}

		user, err := m.userGetter.GetUserByID(r.Context(), userID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				response.Unauthorized(w, "Người dùng không tồn tại")
				return
			}
			response.InternalServerError(w, "Lỗi kiểm tra thông tin người dùng")
			return
		}

		if !user.IsActive {
			response.Forbidden(w, "Tài khoản người dùng đã bị khóa")
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
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := GetUserFromContext(r.Context())
			if !ok {
				response.Unauthorized(w, "Yêu cầu đăng nhập")
				return
			}

			for _, role := range allowedRoles {
				if user.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}

			response.Forbidden(w, "Bạn không có quyền thực hiện hành động này")
		})
	}
}
