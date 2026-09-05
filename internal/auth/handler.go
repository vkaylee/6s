package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"6s/internal/apperror"
	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/i18n"
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
	CountAdmins(ctx context.Context) (int64, error)
	CreateLocalAdmin(ctx context.Context, arg db.CreateLocalAdminParams) (db.User, error)
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
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	accountKey := req.Username
	if accountKey == "" {
		accountKey = req.BadgeCode
	}
	if accountKey == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingLoginInput))
		return
	}
	clientIP := h.limiter.GetClientIP(r)
	if !h.checkRateAndLockout(w, r, clientIP, accountKey) {
		return
	}

	user, ok := h.authenticateUser(r.Context(), req, clientIP, r.UserAgent())
	if !ok {
		h.recordFailureAndLock(r.Context(), clientIP, accountKey, r.UserAgent())
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrInvalidCreds))
		return
	}

	if !user.IsActive {
		response.AppError(w, r, apperror.Forbidden(i18n.ErrAccountLocked))
		return
	}

	h.limiter.RecordSuccess(accountKey)
	if loginErr := h.store.UpdateUserLastLogin(r.Context(), user.ID); loginErr != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(loginErr))
		return
	}
	h.issueTokensAndRespond(w, r, user)
}

func (h *Handler) checkRateAndLockout(w http.ResponseWriter, r *http.Request, clientIP, accountKey string) bool {
	okIP, okAccount, retryAfter := h.limiter.CheckAllowed(clientIP, accountKey)
	if !okIP {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		appErr := apperror.TooManyRequests(i18n.ErrLoginRateLimit).WithDetails(map[string]any{"retry_after": retryAfter})
		response.AppError(w, r, appErr)
		return false
	}
	if !okAccount {
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		appErr := apperror.TooManyRequests(i18n.ErrAccountLockedTemp).WithDetails(map[string]any{"retry_after": retryAfter})
		response.AppError(w, r, appErr)
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
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	rawRefresh, refreshHash, err := GenerateRefreshToken()
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
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
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
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
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingRefreshToken))
		return
	}

	tokenHash := HashRefreshToken(req.RefreshToken)
	oldToken, err := h.store.GetRefreshTokenByHash(r.Context(), tokenHash)
	if err != nil {
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrInvalidRefreshToken).WithCause(err))
		return
	}
	// Revoke old token (Rotation)
	if revErr := h.store.RevokeRefreshToken(r.Context(), oldToken.ID); revErr != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(revErr))
		return
	}
	// Issue new token pair
	newAccess, exp, err := h.tokenManager.GenerateAccessToken(oldToken.UserID)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	newRawRefresh, newHash, err := GenerateRefreshToken()
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
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
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
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
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	var req RevokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	if req.UserID != nil {
		if currentUser.Role != "ADMIN" && currentUser.ID != *req.UserID {
			response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
			return
		}
		if err := h.store.RevokeUserRefreshTokens(r.Context(), *req.UserID); err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
			return
		}
	} else if req.RefreshTokenID != nil {
		if err := h.store.RevokeRefreshToken(r.Context(), *req.RefreshTokenID); err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
			return
		}
	} else {
		if err := h.store.RevokeUserRefreshTokens(r.Context(), currentUser.ID); err != nil {
			response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
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
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(aErr))
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"revoked": true})
}

// Sessions handles GET /api/auth/sessions.
func (h *Handler) Sessions(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := GetUserFromContext(r.Context())
	if !ok {
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	targetUserID := currentUser.ID
	queryUID := r.URL.Query().Get("user_id")
	if queryUID != "" {
		if currentUser.Role != "ADMIN" {
			response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
			return
		}
		uid, err := strconv.ParseInt(queryUID, 10, 64)
		if err != nil {
			response.AppError(w, r, apperror.BadRequest(i18n.ErrInvalidID).WithCause(err))
			return
		}
		targetUserID = uid
	}

	sessions, err := h.store.ListUserActiveSessions(r.Context(), targetUserID)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrSessionsQueryFailed).WithCause(err))
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

// SetupStatusResponse describes whether initial superadmin setup is required.
type SetupStatusResponse struct {
	NeedsSetup bool `json:"needs_setup"`
}

// SetupStatus handles GET /api/auth/setup-status.
func (h *Handler) SetupStatus(w http.ResponseWriter, r *http.Request) {
	adminCount, err := h.store.CountAdmins(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	response.JSON(w, http.StatusOK, SetupStatusResponse{
		NeedsSetup: adminCount == 0,
	})
}

// SetupSuperadminRequest defines payload for initial superadmin creation.
type SetupSuperadminRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
}

// SetupSuperadmin handles POST /api/auth/setup.
func (h *Handler) SetupSuperadmin(w http.ResponseWriter, r *http.Request) {
	adminCount, err := h.store.CountAdmins(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	if adminCount > 0 {
		response.AppError(w, r, apperror.Forbidden(i18n.ErrAdminExists))
		return
	}

	var req SetupSuperadminRequest
	if decodeErr := json.NewDecoder(r.Body).Decode(&req); decodeErr != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(decodeErr))
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.FullName = strings.TrimSpace(req.FullName)
	req.Email = strings.TrimSpace(req.Email)

	if req.Username == "" || len(req.Username) < 3 {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrUsernameTooShort))
		return
	}
	if len(req.Password) < 8 {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrPasswordTooShort))
		return
	}
	if req.FullName == "" {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrMissingFullName))
		return
	}

	var hash string
	hash, err = HashPassword(req.Password)
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	var emailVal sql.NullString
	if req.Email != "" {
		emailVal = sql.NullString{String: req.Email, Valid: true}
	}

	var user db.User
	user, err = h.store.CreateLocalAdmin(r.Context(), db.CreateLocalAdminParams{
		Username:     req.Username,
		PasswordHash: sql.NullString{String: hash, Valid: true},
		FullName:     req.FullName,
		Email:        emailVal,
	})
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrSetupFailed).WithCause(err))
		return
	}

	clientIP := h.limiter.GetClientIP(r)
	if logErr := h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      sql.NullInt64{Int64: user.ID, Valid: true},
		Action:      "INITIAL_SUPERADMIN_SETUP",
		TargetTable: "users",
		TargetID:    user.Username,
		IpAddress:   sql.NullString{String: clientIP, Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	}); logErr != nil {
		return
	}

	h.issueTokensAndRespond(w, r, user)
}
