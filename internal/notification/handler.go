package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"6s/internal/apperror"
	"6s/internal/auth"
	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// ConfigStore defines operations required by notification config handler.
type ConfigStore interface {
	GetNotificationConfig(ctx context.Context) (db.NotificationConfig, error)
	UpsertNotificationConfig(ctx context.Context, arg db.UpsertNotificationConfigParams) (db.NotificationConfig, error)
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// ConfigHandler handles Admin Notification configuration endpoints.
type ConfigHandler struct {
	store  ConfigStore
	cipher *crypto.Cipher
	sender Sender
}

// NewConfigHandler creates a new notification ConfigHandler.
func NewConfigHandler(store ConfigStore, cipher *crypto.Cipher, sender Sender) *ConfigHandler {
	return &ConfigHandler{
		store:  store,
		cipher: cipher,
		sender: sender,
	}
}

// ConfigResponse represents masked notification config for UI.
type ConfigResponse struct {
	WxPusherEnabled bool   `json:"wxpusher_enabled"`
	HasAppToken     bool   `json:"has_app_token"`
	HasWebhookURL   bool   `json:"has_webhook_url"`
	PublicBaseURL   string `json:"public_base_url"`
	UpdatedAt       string `json:"updated_at"`
}

// GetConfig handles GET /api/config/notifications.
func (h *ConfigHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.store.GetNotificationConfig(r.Context())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			response.JSON(w, http.StatusOK, ConfigResponse{
				WxPusherEnabled: true,
				PublicBaseURL:   "https://6s.factory.lan",
			})
			return
		}
		response.AppError(w, r, apperror.Internal(i18n.ErrNotificationLoadFailed).WithCause(err))
		return
	}

	response.JSON(w, http.StatusOK, ConfigResponse{
		WxPusherEnabled: cfg.WxpusherEnabled,
		HasAppToken:     cfg.WxpusherAppToken != "",
		HasWebhookURL:   cfg.LanWebhookUrl != "",
		PublicBaseURL:   cfg.PublicBaseUrl,
		UpdatedAt:       cfg.UpdatedAt.Format(timeFormatRFC3339),
	})
}

const timeFormatRFC3339 = "2006-01-02T15:04:05Z07:00"

// UpdateConfigRequest defines input for PUT /api/config/notifications.
type UpdateConfigRequest struct {
	WxPusherEnabled  *bool  `json:"wxpusher_enabled"`
	WxPusherAppToken string `json:"wxpusher_app_token"`
	LANWebhookURL    string `json:"lan_webhook_url"`
	PublicBaseURL    string `json:"public_base_url"`
}

// UpdateConfig handles PUT /api/config/notifications (Admin).
func (h *ConfigHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		response.AppError(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}

	var req UpdateConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}

	encryptedAppToken := ""
	if req.WxPusherAppToken != "" {
		if h.cipher != nil {
			enc, err := h.cipher.Encrypt(req.WxPusherAppToken)
			if err != nil {
				response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
				return
			}
			encryptedAppToken = enc
		} else {
			encryptedAppToken = req.WxPusherAppToken
		}
	}

	encryptedWebhookURL := ""
	if req.LANWebhookURL != "" {
		if h.cipher != nil {
			enc, err := h.cipher.Encrypt(req.LANWebhookURL)
			if err != nil {
				response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
				return
			}
			encryptedWebhookURL = enc
		} else {
			encryptedWebhookURL = req.LANWebhookURL
		}
	}

	enabled := true
	if req.WxPusherEnabled != nil {
		enabled = *req.WxPusherEnabled
	}

	baseURL := req.PublicBaseURL
	if baseURL == "" {
		baseURL = "https://6s.factory.lan"
	}

	_, err := h.store.UpsertNotificationConfig(r.Context(), db.UpsertNotificationConfigParams{
		WxpusherEnabled:  enabled,
		WxpusherAppToken: encryptedAppToken,
		LanWebhookUrl:    encryptedWebhookURL,
		PublicBaseUrl:    baseURL,
		UpdatedBy:        sql.NullInt64{Int64: currentUser.ID, Valid: true},
	})
	if err != nil {
		response.AppError(w, r, apperror.Internal(i18n.ErrNotificationSaveFailed).WithCause(err))
		return
	}

	if alErr := h.store.InsertAuditLog(r.Context(), db.InsertAuditLogParams{
		UserID:      sql.NullInt64{Int64: currentUser.ID, Valid: true},
		Action:      "UPDATE_NOTIFICATION_CONFIG",
		TargetTable: "notification_configs",
		TargetID:    "1",
		OldValue:    nil,
		NewValue:    nil,
		IpAddress:   sql.NullString{},
		UserAgent:   sql.NullString{},
	}); alErr != nil {
		log.Printf("insert audit log err: %v", alErr)
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"message": "Cập nhật cấu hình thông báo thành công",
	})
}

// TestConfigResult provides status per notification channel.
type TestConfigResult struct {
	Channel string `json:"channel"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// TestConfig handles POST /api/config/notifications/test (Admin).
func (h *ConfigHandler) TestConfig(w http.ResponseWriter, r *http.Request) {
	cfgRow, err := h.store.GetNotificationConfig(r.Context())
	if err != nil {
		response.AppError(w, r, apperror.BadRequest(i18n.ErrNotificationTestMissing).WithCause(err))
		return
	}

	appToken := cfgRow.WxpusherAppToken
	if appToken != "" && h.cipher != nil {
		if dec, decErr := h.cipher.Decrypt(appToken); decErr == nil {
			appToken = dec
		}
	}

	webhookURL := cfgRow.LanWebhookUrl
	if webhookURL != "" && h.cipher != nil {
		if dec, decErr := h.cipher.Decrypt(webhookURL); decErr == nil {
			webhookURL = dec
		}
	}

	decryptedCfg := DecryptedConfig{
		WxPusherEnabled:  cfgRow.WxpusherEnabled,
		WxPusherAppToken: appToken,
		LANWebhookURL:    webhookURL,
		PublicBaseURL:    cfgRow.PublicBaseUrl,
	}

	var results []TestConfigResult
	testPayload := `{"issue_id":0,"category":"6S","location_code":"SYSTEM_TEST","reporter_name":"Admin"}`

	// Test WxPusher if configured
	if decryptedCfg.WxPusherAppToken != "" {
		wErr := h.sender.Send(r.Context(), ChannelWxPusher, testPayload, decryptedCfg)
		res := TestConfigResult{Channel: ChannelWxPusher, Success: (wErr == nil)}
		if wErr != nil {
			res.Error = wErr.Error()
		}
		results = append(results, res)
	}

	// Test LAN Webhook if configured
	if decryptedCfg.LANWebhookURL != "" {
		lErr := h.sender.Send(r.Context(), ChannelLANWebhook, testPayload, decryptedCfg)
		res := TestConfigResult{Channel: ChannelLANWebhook, Success: (lErr == nil)}
		if lErr != nil {
			res.Error = lErr.Error()
		}
		results = append(results, res)
	}

	response.JSON(w, http.StatusOK, results)
}
