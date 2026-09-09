// Package auth provides authentication and authorization handlers.
package auth

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"6s/internal/apperror"
	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// ADConfigHandler manages Active Directory settings.
type ADConfigHandler struct {
	store      Store
	cipher     *crypto.Cipher
	ldapClient LDAPClient
}

// NewADConfigHandler creates a new ADConfigHandler.
func NewADConfigHandler(store Store, cipher *crypto.Cipher, ldapClient LDAPClient) *ADConfigHandler {
	return &ADConfigHandler{
		store:      store,
		cipher:     cipher,
		ldapClient: ldapClient,
	}
}

// ADConfigResponse represents public AD configuration payload.
type ADConfigResponse struct {
	IsEnabled       bool   `json:"is_enabled"`
	Server          string `json:"server"`
	Port            int    `json:"port"`
	UseTLS          bool   `json:"use_tls"`
	SkipTLSVerify   bool   `json:"skip_tls_verify"`
	BaseDN          string `json:"base_dn"`
	BindDN          string `json:"bind_dn"`
	HasBindPassword bool   `json:"has_bind_password"`
	UserFilter      string `json:"user_filter"`
	GroupAdminDN    string `json:"group_admin_dn"`
	GroupSafetyDN   string `json:"group_safety_dn"`
	GroupLeaderDN   string `json:"group_leader_dn"`
	UpdatedAt       string `json:"updated_at"`
}

// GetADConfig handles GET /api/config/ad (Admin only).
func (h *ADConfigHandler) GetADConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetADConfig(r.Context())
	if err != nil {
		_ = response.JSON(w, http.StatusOK, ADConfigResponse{
			IsEnabled:     false,
			Server:        "",
			Port:          636,
			UseTLS:        true,
			SkipTLSVerify: false,
			BaseDN:        "",
			BindDN:        "",
			UserFilter:    "(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=%s)(userPrincipalName=%s)))",
			UpdatedAt:     time.Now().Format(time.RFC3339),
		})
		return
	}

	resp := ADConfigResponse{
		IsEnabled:       cfg.IsEnabled,
		Server:          cfg.Server,
		Port:            int(cfg.Port),
		UseTLS:          cfg.UseTls,
		SkipTLSVerify:   cfg.SkipTlsVerify,
		BaseDN:          cfg.BaseDn,
		BindDN:          cfg.BindDn,
		HasBindPassword: cfg.BindPassword != "",
		UserFilter:      cfg.UserFilter,
		GroupAdminDN:    cfg.GroupAdminDn,
		GroupSafetyDN:   cfg.GroupSafetyDn,
		GroupLeaderDN:   cfg.GroupLeaderDn,
		UpdatedAt:       cfg.UpdatedAt.Format(time.RFC3339),
	}

	_ = response.JSON(w, http.StatusOK, resp)
}

// UpdateADConfigRequest payload to update AD settings.
type UpdateADConfigRequest struct {
	IsEnabled     bool   `json:"is_enabled"`
	Server        string `json:"server"`
	Port          int    `json:"port"`
	UseTLS        bool   `json:"use_tls"`
	SkipTLSVerify bool   `json:"skip_tls_verify"`
	BaseDN        string `json:"base_dn"`
	BindDN        string `json:"bind_dn"`
	BindPassword  string `json:"bind_password"`
	UserFilter    string `json:"user_filter"`
	GroupAdminDN  string `json:"group_admin_dn"`
	GroupSafetyDN string `json:"group_safety_dn"`
	GroupLeaderDN string `json:"group_leader_dn"`
}

// UpdateADConfig handles PUT /api/config/ad (Admin only).
func (h *ADConfigHandler) UpdateADConfig(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := GetUserFromContext(r.Context())
	if !ok {
		_ = response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	var req UpdateADConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	if req.Port <= 0 || req.Port > 65535 {
		req.Port = 636
	}

	var encryptedBindPass string
	if req.BindPassword != "" {
		if h.cipher == nil {
			_ = response.AppError(w, r, apperror.Internal(i18n.ErrInternal))
			return
		}
		enc, err := h.cipher.Encrypt(req.BindPassword)
		if err != nil {
			_ = response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
			return
		}
		encryptedBindPass = enc
	}

	portVal := int32(req.Port) //nolint:gosec
	saved, err := h.store.UpsertADConfig(r.Context(), db.UpsertADConfigParams{
		IsEnabled:     req.IsEnabled,
		Server:        req.Server,
		Port:          portVal,
		UseTls:        req.UseTLS,
		SkipTlsVerify: req.SkipTLSVerify,
		BaseDn:        req.BaseDN,
		BindDn:        req.BindDN,
		BindPassword:  encryptedBindPass,
		UserFilter:    req.UserFilter,
		GroupAdminDn:  req.GroupAdminDN,
		GroupSafetyDn: req.GroupSafetyDN,
		GroupLeaderDn: req.GroupLeaderDN,
		UpdatedBy:     sql.NullInt64{Int64: currentUser.ID, Valid: true},
	})
	if err != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}

	if auditErr := h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      sql.NullInt64{Int64: currentUser.ID, Valid: true},
		Action:      "UPDATE_AD_CONFIG",
		TargetTable: "ad_configs",
		TargetID:    "1",
		IpAddress:   sql.NullString{String: r.RemoteAddr, Valid: true},
		UserAgent:   sql.NullString{String: r.UserAgent(), Valid: true},
	}); auditErr != nil {
		_ = response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(auditErr))
		return
	}
	_ = response.JSON(w, http.StatusOK, ADConfigResponse{
		IsEnabled:       saved.IsEnabled,
		Server:          saved.Server,
		Port:            int(saved.Port),
		UseTLS:          saved.UseTls,
		SkipTLSVerify:   saved.SkipTlsVerify,
		BaseDN:          saved.BaseDn,
		BindDN:          saved.BindDn,
		HasBindPassword: saved.BindPassword != "",
		UserFilter:      saved.UserFilter,
		GroupAdminDN:    saved.GroupAdminDn,
		GroupSafetyDN:   saved.GroupSafetyDn,
		GroupLeaderDN:   saved.GroupLeaderDn,
		UpdatedAt:       saved.UpdatedAt.Format(time.RFC3339),
	})
}

// TestADConfig handles POST /api/config/ad/test (Admin only).
func (h *ADConfigHandler) TestADConfig(w http.ResponseWriter, r *http.Request) { //nolint:gocognit // distinct validation failures map to distinct API errors
	var req UpdateADConfigRequest
	if r.Body != nil {
		if decErr := json.NewDecoder(r.Body).Decode(&req); decErr != nil && decErr.Error() != "EOF" {
			_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(decErr))
			return
		}
	}
	if saved, err := h.store.GetADConfig(r.Context()); err == nil {
		if req.Server == "" {
			req.Server = saved.Server
		}
		if req.Port == 0 {
			req.Port = int(saved.Port)
		}
		if req.BaseDN == "" {
			req.BaseDN = saved.BaseDn
		}
		if req.BindDN == "" {
			req.BindDN = saved.BindDn
		}
		if req.UserFilter == "" {
			req.UserFilter = saved.UserFilter
		}
		if !req.UseTLS {
			req.UseTLS = saved.UseTls
		}
		if !req.SkipTLSVerify {
			req.SkipTLSVerify = saved.SkipTlsVerify
		}
		if req.BindPassword == "" && saved.BindPassword != "" {
			if h.cipher == nil {
				_ = response.AppError(w, r, apperror.Internal(i18n.ErrADEncryptionKeyMissing))
				return
			}
			var decryptErr error
			req.BindPassword, decryptErr = h.cipher.Decrypt(saved.BindPassword)
			if decryptErr != nil {
				_ = response.AppError(w, r, apperror.Internal(i18n.ErrADEncryptionKeyMissing))
				return
			}
		}
	} else if req.Server == "" {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrADConfigNotFound).WithCause(err))
		return
	}

	client := h.ldapClient
	if client == nil {
		client = NewLiveLDAPClient(LDAPConfig{
			Server:        req.Server,
			Port:          req.Port,
			UseTLS:        req.UseTLS,
			SkipTLSVerify: req.SkipTLSVerify,
			BaseDN:        req.BaseDN,
			BindDN:        req.BindDN,
			BindPassword:  req.BindPassword,
			UserFilter:    req.UserFilter,
		})
	}

	start := time.Now()
	if err := client.TestSearchPermission(); err != nil {
		_ = response.AppError(w, r, apperror.BadRequest(i18n.ErrADTestFailed, err.Error()).WithCause(err))
		return
	}

	elapsed := time.Since(start).Milliseconds()
	_ = response.JSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "LDAP bind and user search permission OK",
		"duration": elapsed,
	})
}
