package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/response"
)

// Store defines database operations required by auth handler.
type Store interface {
	GetUserByID(ctx context.Context, id int64) (db.User, error)
	GetUserByUsername(ctx context.Context, username string) (db.User, error)
	GetUserByBadgeCode(ctx context.Context, badgeCode sql.NullString) (db.User, error)
	UpdateUserLastLogin(ctx context.Context, id int64) error
	CreateUserJIT(ctx context.Context, arg db.CreateUserJITParams) (db.User, error)
	UpdateUserADLogin(ctx context.Context, arg db.UpdateUserADLoginParams) (db.User, error)
	CreateRefreshToken(ctx context.Context, arg db.CreateRefreshTokenParams) (db.RefreshToken, error)
	GetRefreshTokenByHash(ctx context.Context, tokenHash string) (db.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, id int64) error
	RevokeUserRefreshTokens(ctx context.Context, userID int64) error
	ListUserActiveSessions(ctx context.Context, userID int64) ([]db.ListUserActiveSessionsRow, error)
	GetADConfig(ctx context.Context) (db.AdConfig, error)
	UpsertADConfig(ctx context.Context, arg db.UpsertADConfigParams) (db.AdConfig, error)
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// Handler handles authentication endpoints.
type Handler struct {
	store        Store
	tokenManager *TokenManager
	limiter      *LoginLimiter
	cipher       *crypto.Cipher
	ldapClient   LDAPClient
}

// NewHandler creates a new Handler.
func NewHandler(store Store, tokenManager *TokenManager, limiter *LoginLimiter, cipher *crypto.Cipher, ldapClient LDAPClient) *Handler {
	return &Handler{
		store:        store,
		tokenManager: tokenManager,
		limiter:      limiter,
		cipher:       cipher,
		ldapClient:   ldapClient,
	}
}

// LoginRequest defines login payload.
type LoginRequest struct {
	Username  string `json:"username"`
	Password  string `json:"password"`
	BadgeCode string `json:"badge_code"`
}

// UserResponse defines user data returned in auth responses.
type UserResponse struct {
	ID                   int64   `json:"id"`
	Username             string  `json:"username"`
	AuthSource           string  `json:"auth_source"`
	Role                 string  `json:"role"`
	AssignedLocationCode *string `json:"assigned_location_code"`
	FullName             string  `json:"full_name"`
	Email                *string `json:"email"`
}

func toUserResponse(u db.User) UserResponse {
	resp := UserResponse{
		ID:         u.ID,
		Username:   u.Username,
		AuthSource: u.AuthSource,
		Role:       u.Role,
		FullName:   u.FullName,
	}
	if u.AssignedLocationCode.Valid {
		resp.AssignedLocationCode = &u.AssignedLocationCode.String
	}
	if u.Email.Valid {
		resp.Email = &u.Email.String
	}
	return resp
}

// Login handles POST /api/auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Dữ liệu đăng nhập không hợp lệ")
		return
	}

	accountKey := req.Username
	if accountKey == "" {
		accountKey = req.BadgeCode
	}
	if accountKey == "" {
		response.BadRequest(w, "Vui lòng nhập tên tài khoản hoặc mã thẻ")
		return
	}

	clientIP := h.limiter.GetClientIP(r)
	if !h.checkRateAndLockout(w, clientIP, accountKey) {
		return
	}

	user, ok := h.authenticateUser(r.Context(), req, clientIP, r.UserAgent())
	if !ok {
		h.recordFailureAndLock(r.Context(), clientIP, accountKey, r.UserAgent())
		response.Unauthorized(w, "Thông tin đăng nhập không chính xác")
		return
	}

	if !user.IsActive {
		response.Forbidden(w, "Tài khoản đã bị khóa")
		return
	}

	h.limiter.RecordSuccess(accountKey)
	if loginErr := h.store.UpdateUserLastLogin(r.Context(), user.ID); loginErr != nil {
		response.InternalServerError(w, "Lỗi cập nhật thời gian đăng nhập")
		return
	}
	h.issueTokensAndRespond(w, r, user)
}

func (h *Handler) checkRateAndLockout(w http.ResponseWriter, clientIP, accountKey string) bool {
	okIP, okAccount, retryAfter := h.limiter.CheckAllowed(clientIP, accountKey)
	if !okIP {
		response.TooManyRequests(w, "Vượt quá giới hạn thử đăng nhập (5 lần/phút)", retryAfter)
		return false
	}
	if !okAccount {
		response.TooManyRequests(w, "Tài khoản bị tạm khóa 15 phút do nhập sai 10 lần liên tiếp", retryAfter)
		return false
	}
	return true
}

func (h *Handler) authenticateUser(ctx context.Context, req LoginRequest, clientIP, userAgent string) (db.User, bool) {
	// Try AD auth if enabled
	adCfg, err := h.store.GetADConfig(ctx)
	if err == nil && adCfg.IsEnabled && req.Username != "" && req.Password != "" {
		u, ok, isCredError := h.authenticateAD(ctx, adCfg, req.Username, req.Password)
		if ok {
			return u, true
		}
		if isCredError {
			// Do NOT fallback to local on wrong AD credentials
			return db.User{}, false
		}
		if aErr := h.store.InsertAuditLog(ctx, db.InsertAuditLogParams{
			Action:      "AD_UNREACHABLE_FALLBACK",
			TargetTable: "users",
			TargetID:    req.Username,
			IpAddress:   sql.NullString{String: clientIP, Valid: true},
			UserAgent:   sql.NullString{String: userAgent, Valid: true},
		}); aErr != nil {
			return db.User{}, false
		}
	}
	return h.authenticateLocal(ctx, req)
}

func (h *Handler) authenticateAD(ctx context.Context, adCfg db.AdConfig, username, password string) (db.User, bool, bool) {
	client := h.resolveLDAPClient(adCfg)
	ldapUser, ldapErr := client.Authenticate(username, password)
	if ldapErr == nil && ldapUser != nil {
		u, err := h.jitProvisionUser(ctx, username, ldapUser)
		return u, err == nil, false
	}
	if errors.Is(ldapErr, ErrLDAPInvalidCredentials) {
		return db.User{}, false, true
	}
	return db.User{}, false, false
}

func (h *Handler) resolveLDAPClient(adCfg db.AdConfig) LDAPClient {
	if h.ldapClient != nil {
		return h.ldapClient
	}
	var plainBindPass string
	if adCfg.BindPassword != "" && h.cipher != nil {
		if dec, decErr := h.cipher.Decrypt(adCfg.BindPassword); decErr == nil {
			plainBindPass = dec
		}
	}
	return NewLiveLDAPClient(LDAPConfig{
		Server:        adCfg.Server,
		Port:          int(adCfg.Port),
		UseTLS:        adCfg.UseTls,
		SkipTLSVerify: adCfg.SkipTlsVerify,
		BaseDN:        adCfg.BaseDn,
		BindDN:        adCfg.BindDn,
		BindPassword:  plainBindPass,
		UserFilter:    adCfg.UserFilter,
		GroupAdminDN:  adCfg.GroupAdminDn,
		GroupSafetyDN: adCfg.GroupSafetyDn,
		GroupLeaderDN: adCfg.GroupLeaderDn,
	})
}

func (h *Handler) jitProvisionUser(ctx context.Context, username string, ldapUser *LDAPUser) (db.User, error) {
	existingUser, findErr := h.store.GetUserByUsername(ctx, username)
	var emailVal sql.NullString
	if ldapUser.Email != "" {
		emailVal = sql.NullString{String: ldapUser.Email, Valid: true}
	}

	if errors.Is(findErr, sql.ErrNoRows) {
		return h.store.CreateUserJIT(ctx, db.CreateUserJITParams{
			Username: username,
			AdDn:     sql.NullString{String: ldapUser.DN, Valid: true},
			FullName: ldapUser.FullName,
			Email:    emailVal,
			Role:     ldapUser.MatchedRole,
		})
	}

	if findErr == nil {
		return h.store.UpdateUserADLogin(ctx, db.UpdateUserADLoginParams{
			ID:       existingUser.ID,
			FullName: ldapUser.FullName,
			Email:    emailVal,
			Role:     ldapUser.MatchedRole,
		})
	}

	return db.User{}, findErr
}

func (h *Handler) authenticateLocal(ctx context.Context, req LoginRequest) (db.User, bool) {
	if req.Username != "" {
		u, err := h.store.GetUserByUsername(ctx, req.Username)
		if err == nil && u.AuthSource == "LOCAL" && u.PasswordHash.Valid {
			if match, vErr := VerifyPassword(req.Password, u.PasswordHash.String); vErr == nil && match {
				return u, true
			}
		}
	} else if req.BadgeCode != "" {
		u, err := h.store.GetUserByBadgeCode(ctx, sql.NullString{String: req.BadgeCode, Valid: true})
		if err == nil {
			return u, true
		}
	}
	return db.User{}, false
}

func (h *Handler) issueTokensAndRespond(w http.ResponseWriter, r *http.Request, user db.User) {
	accessToken, exp, err := h.tokenManager.GenerateAccessToken(user.ID)
	if err != nil {
		response.InternalServerError(w, "Lỗi tạo access token")
		return
	}

	rawRefresh, refreshHash, err := GenerateRefreshToken()
	if err != nil {
		response.InternalServerError(w, "Lỗi tạo refresh token")
		return
	}

	deviceInfo := r.UserAgent()
	refreshExpiresAt := time.Now().Add(RefreshTokenDuration)

	_, err = h.store.CreateRefreshToken(r.Context(), db.CreateRefreshTokenParams{
		UserID:     user.ID,
		TokenHash:  refreshHash,
		DeviceInfo: sql.NullString{String: deviceInfo, Valid: deviceInfo != ""},
		ExpiresAt:  refreshExpiresAt,
	})
	if err != nil {
		response.InternalServerError(w, "Lỗi lưu refresh token")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"access_token":       accessToken,
		"expires_in":         exp,
		"refresh_token":      rawRefresh,
		"refresh_expires_in": int(RefreshTokenDuration.Seconds()),
		"user":               toUserResponse(user),
	})
}

func (h *Handler) recordFailureAndLock(ctx context.Context, clientIP, accountKey, userAgent string) {
	locked := h.limiter.RecordFailure(clientIP, accountKey)
	if locked {
		if aErr := h.store.InsertAuditLog(ctx, db.InsertAuditLogParams{
			Action:      "LOGIN_LOCKED",
			TargetTable: "users",
			TargetID:    accountKey,
			IpAddress:   sql.NullString{String: clientIP, Valid: true},
			UserAgent:   sql.NullString{String: userAgent, Valid: true},
		}); aErr != nil {
			return
		}
	}
}

// RefreshRequest defines payload for token refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh handles POST /api/auth/refresh with token rotation.
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		response.BadRequest(w, "Thiếu refresh token")
		return
	}

	tokenHash := HashRefreshToken(req.RefreshToken)
	oldToken, err := h.store.GetRefreshTokenByHash(r.Context(), tokenHash)
	if err != nil {
		response.Unauthorized(w, "Refresh token không hợp lệ hoặc đã hết hạn")
		return
	}

	// Revoke old token (Rotation)
	if revErr := h.store.RevokeRefreshToken(r.Context(), oldToken.ID); revErr != nil {
		response.InternalServerError(w, "Lỗi thu hồi token cũ")
		return
	}
	// Issue new token pair
	newAccess, exp, err := h.tokenManager.GenerateAccessToken(oldToken.UserID)
	if err != nil {
		response.InternalServerError(w, "Lỗi tạo access token")
		return
	}

	newRawRefresh, newHash, err := GenerateRefreshToken()
	if err != nil {
		response.InternalServerError(w, "Lỗi tạo refresh token")
		return
	}

	deviceInfo := r.UserAgent()
	_, err = h.store.CreateRefreshToken(r.Context(), db.CreateRefreshTokenParams{
		UserID:     oldToken.UserID,
		TokenHash:  newHash,
		DeviceInfo: sql.NullString{String: deviceInfo, Valid: deviceInfo != ""},
		ExpiresAt:  time.Now().Add(RefreshTokenDuration),
	})
	if err != nil {
		response.InternalServerError(w, "Lỗi lưu refresh token mới")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"access_token":       newAccess,
		"expires_in":         exp,
		"refresh_token":      newRawRefresh,
		"refresh_expires_in": int(RefreshTokenDuration.Seconds()),
	})
}

// RevokeRequest defines payload to revoke tokens.
type RevokeRequest struct {
	RefreshTokenID *int64 `json:"refresh_token_id"`
	UserID         *int64 `json:"user_id"`
}

// Revoke handles POST /api/auth/revoke.
func (h *Handler) Revoke(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	var req RevokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Dữ liệu yêu cầu không hợp lệ")
		return
	}

	if req.UserID != nil {
		if currentUser.Role != "ADMIN" && currentUser.ID != *req.UserID {
			response.Forbidden(w, "Chỉ quản trị viên mới có quyền thu hồi toàn bộ phiên của người dùng khác")
			return
		}
		if err := h.store.RevokeUserRefreshTokens(r.Context(), *req.UserID); err != nil {
			response.InternalServerError(w, "Lỗi thu hồi phiên người dùng")
			return
		}
	} else if req.RefreshTokenID != nil {
		if err := h.store.RevokeRefreshToken(r.Context(), *req.RefreshTokenID); err != nil {
			response.InternalServerError(w, "Lỗi thu hồi token")
			return
		}
	} else {
		if err := h.store.RevokeUserRefreshTokens(r.Context(), currentUser.ID); err != nil {
			response.InternalServerError(w, "Lỗi thu hồi phiên đăng nhập")
			return
		}
	}

	if aErr := h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      sql.NullInt64{Int64: currentUser.ID, Valid: true},
		Action:      "TOKEN_REVOKED",
		TargetTable: "refresh_tokens",
		TargetID:    strconv.FormatInt(currentUser.ID, 10),
		IpAddress:   sql.NullString{String: h.limiter.GetClientIP(r), Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	}); aErr != nil {
		response.InternalServerError(w, "Lỗi ghi audit log")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"revoked": true})
}

// Sessions handles GET /api/auth/sessions.
func (h *Handler) Sessions(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := GetUserFromContext(r.Context())
	if !ok {
		response.Unauthorized(w, "Yêu cầu đăng nhập")
		return
	}

	targetUserID := currentUser.ID
	queryUID := r.URL.Query().Get("user_id")
	if queryUID != "" {
		if currentUser.Role != "ADMIN" {
			response.Forbidden(w, "Chỉ quản trị viên mới được xem phiên của người dùng khác")
			return
		}
		uid, err := strconv.ParseInt(queryUID, 10, 64)
		if err != nil {
			response.BadRequest(w, "user_id không hợp lệ")
			return
		}
		targetUserID = uid
	}

	sessions, err := h.store.ListUserActiveSessions(r.Context(), targetUserID)
	if err != nil {
		response.InternalServerError(w, "Lỗi truy vấn danh sách phiên đăng nhập")
		return
	}

	type SessionItem struct {
		ID         int64   `json:"id"`
		DeviceInfo *string `json:"device_info"`
		CreatedAt  string  `json:"created_at"`
		ExpiresAt  string  `json:"expires_at"`
	}

	items := make([]SessionItem, 0, len(sessions))
	for _, s := range sessions {
		item := SessionItem{
			ID:        s.ID,
			CreatedAt: s.CreatedAt.Format(time.RFC3339),
			ExpiresAt: s.ExpiresAt.Format(time.RFC3339),
		}
		if s.DeviceInfo.Valid {
			item.DeviceInfo = &s.DeviceInfo.String
		}
		items = append(items, item)
	}

	response.JSON(w, http.StatusOK, items)
}
