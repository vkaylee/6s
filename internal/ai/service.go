package ai

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"6s/internal/apperror"
	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/i18n"
)

const (
	timeFormatRFC3339  = "2006-01-02T15:04:05Z07:00"
	defaultHTTPTimeout = 30 * time.Second
)

// Store defines persistence operations required for AI management.
type Store interface {
	GetAIConfig(ctx context.Context) (db.AiConfig, error)
	UpsertAIConfig(ctx context.Context, arg db.UpsertAIConfigParams) (db.AiConfig, error)
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// ConfigResponse represents masked AI config for frontend.
type ConfigResponse struct {
	IsEnabled      bool   `json:"is_enabled"`
	BaseURL        string `json:"base_url"`
	HasAPIKey      bool   `json:"has_api_key"`
	DefaultModel   string `json:"default_model"`
	ModelTranslate string `json:"model_translate"`
	ModelVision    string `json:"model_vision"`
	ModelSummary   string `json:"model_summary"`
	UpdatedAt      string `json:"updated_at,omitempty"`
}

// UpdateConfigRequest defines parameters for updating AI configuration.
type UpdateConfigRequest struct {
	IsEnabled      *bool  `json:"is_enabled"`
	BaseURL        string `json:"base_url"`
	APIKey         string `json:"api_key"`
	DefaultModel   string `json:"default_model"`
	ModelTranslate string `json:"model_translate"`
	ModelVision    string `json:"model_vision"`
	ModelSummary   string `json:"model_summary"`
}

// TestRequest defines parameters for testing connection or a specific model.
type TestRequest struct {
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
	Model   string `json:"model"`
	Purpose string `json:"purpose"`
}

// TestResponse represents ping result for connection or model.
type TestResponse struct {
	Success   bool   `json:"success"`
	LatencyMs int64  `json:"latency_ms"`
	ModelUsed string `json:"model_used"`
	Reply     string `json:"reply,omitempty"`
	Error     string `json:"error,omitempty"`
}

// DNSTestRequest defines parameters for testing DNS resolution.
type DNSTestRequest struct {
	BaseURL string `json:"base_url"`
}

// DNSTestResponse represents DNS resolution result for AI gateway.
type DNSTestResponse struct {
	Success   bool     `json:"success"`
	Host      string   `json:"host,omitempty"`
	IPs       []string `json:"ips,omitempty"`
	LatencyMs int64    `json:"latency_ms,omitempty"`
	Error     string   `json:"error,omitempty"`
}

// Service provides AI operations including configuration and OpenAI-compatible translation.
type Service struct {
	store      Store
	cipher     *crypto.Cipher
	httpClient *http.Client
}

// NewService creates a new Service instance.
func NewService(store Store, cipher *crypto.Cipher, httpClient *http.Client) *Service {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &Service{
		store:      store,
		cipher:     cipher,
		httpClient: httpClient,
	}
}

// GetConfig returns the masked AI configuration.
func (s *Service) GetConfig(ctx context.Context) (ConfigResponse, error) {
	cfg, err := s.store.GetAIConfig(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ConfigResponse{
				IsEnabled: false,
			}, nil
		}
		return ConfigResponse{}, apperror.Internal(i18n.ErrAILoadFailed).WithCause(err)
	}

	return ConfigResponse{
		IsEnabled:      cfg.IsEnabled,
		BaseURL:        cfg.BaseUrl,
		HasAPIKey:      cfg.ApiKey != "",
		DefaultModel:   cfg.DefaultModel,
		ModelTranslate: cfg.ModelTranslate,
		ModelVision:    cfg.ModelVision,
		ModelSummary:   cfg.ModelSummary,
		UpdatedAt:      cfg.UpdatedAt.Format(timeFormatRFC3339),
	}, nil
}

func toJSONRaw(v any) json.RawMessage {
	data, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return data
}

// UpdateConfig updates or creates the AI configuration.
func (s *Service) UpdateConfig(ctx context.Context, req UpdateConfigRequest, userID int64) (ConfigResponse, error) {
	oldCfg, getErr := s.store.GetAIConfig(ctx)
	oldRaw := toJSONRaw(map[string]any{
		"is_enabled":      oldCfg.IsEnabled,
		"base_url":        oldCfg.BaseUrl,
		"default_model":   oldCfg.DefaultModel,
		"model_translate": oldCfg.ModelTranslate,
		"model_vision":    oldCfg.ModelVision,
		"model_summary":   oldCfg.ModelSummary,
	})

	encryptedKey := ""
	if req.APIKey != "" {
		if s.cipher != nil {
			enc, encErr := s.cipher.Encrypt(req.APIKey)
			if encErr != nil {
				return ConfigResponse{}, apperror.Internal(i18n.ErrInternal).WithCause(encErr)
			}
			encryptedKey = enc
		} else {
			encryptedKey = req.APIKey
		}
	}

	isEnabled := false
	if req.IsEnabled != nil {
		isEnabled = *req.IsEnabled
	} else if getErr == nil {
		isEnabled = oldCfg.IsEnabled
	}

	saved, err := s.store.UpsertAIConfig(ctx, db.UpsertAIConfigParams{
		IsEnabled:      isEnabled,
		BaseUrl:        strings.TrimSpace(req.BaseURL),
		ApiKey:         encryptedKey,
		DefaultModel:   strings.TrimSpace(req.DefaultModel),
		ModelTranslate: strings.TrimSpace(req.ModelTranslate),
		ModelVision:    strings.TrimSpace(req.ModelVision),
		ModelSummary:   strings.TrimSpace(req.ModelSummary),
		UpdatedBy:      sql.NullInt64{Int64: userID, Valid: userID > 0},
	})
	if err != nil {
		return ConfigResponse{}, apperror.Internal(i18n.ErrAISaveFailed).WithCause(err)
	}

	newRaw := toJSONRaw(map[string]any{
		"is_enabled":      saved.IsEnabled,
		"base_url":        saved.BaseUrl,
		"default_model":   saved.DefaultModel,
		"model_translate": saved.ModelTranslate,
		"model_vision":    saved.ModelVision,
		"model_summary":   saved.ModelSummary,
	})

	if auditErr := s.store.InsertAuditLog(ctx, db.InsertAuditLogParams{
		UserID:      sql.NullInt64{Int64: userID, Valid: userID > 0},
		Action:      "UPDATE_AI_CONFIG",
		TargetTable: "ai_configs",
		TargetID:    "1",
		OldValue:    oldRaw,
		NewValue:    newRaw,
		IpAddress:   sql.NullString{},
		UserAgent:   sql.NullString{},
	}); auditErr != nil {
		log.Printf("ai config audit log err: %v", auditErr)
	}

	return ConfigResponse{
		IsEnabled:      saved.IsEnabled,
		BaseURL:        saved.BaseUrl,
		HasAPIKey:      saved.ApiKey != "",
		DefaultModel:   saved.DefaultModel,
		ModelTranslate: saved.ModelTranslate,
		ModelVision:    saved.ModelVision,
		ModelSummary:   saved.ModelSummary,
		UpdatedAt:      saved.UpdatedAt.Format(timeFormatRFC3339),
	}, nil
}

// resolveModel picks the purpose model or falls back to default_model.
func resolveModel(cfg db.AiConfig) (string, error) {
	model := strings.TrimSpace(cfg.ModelTranslate)
	if model == "" {
		model = strings.TrimSpace(cfg.DefaultModel)
	}
	if model == "" {
		return "", apperror.BadRequest(i18n.ErrAIModelMissing)
	}
	return model, nil
}

// buildEndpoint ensures the base URL points to the chat completions path.
func buildEndpoint(baseURL string) string {
	ep := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if !strings.HasSuffix(ep, "/chat/completions") {
		ep += "/chat/completions"
	}
	return ep
}

// resolveTargetLang converts code to descriptive language name.
func resolveTargetLang(lang string) string {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "zh", "zh-cn", "zh-tw":
		return "Simplified Chinese"
	case "en":
		return "English"
	default:
		return "Vietnamese"
	}
}

// buildRequestBody formats standard OpenAI chat completion JSON.
func buildRequestBody(model, text, targetLang string) ([]byte, error) {
	langName := resolveTargetLang(targetLang)
	reqBody := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You are a professional factory 6S issue translator. Translate the text into " + langName + ". Maintain manufacturing terminology, location codes, and tags. Return ONLY the translated text without extra formatting, notes, or explanations.",
			},
			{
				"role":    "user",
				"content": text,
			},
		},
		"temperature": 0.1,
		"stream":      false,
	}
	return json.Marshal(reqBody)
}

type chatMessage struct {
	Content          string `json:"content"`
	ReasoningContent string `json:"reasoning_content"`
	Reasoning        string `json:"reasoning"`
}

type chatDelta struct {
	Content          string `json:"content"`
	ReasoningContent string `json:"reasoning_content"`
}

type chatChoice struct {
	Message chatMessage `json:"message"`
	Delta   chatDelta   `json:"delta"`
}

type chatResponsePayload struct {
	Choices []chatChoice `json:"choices"`
	Error   *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func parseSSEResponse(trimmed []byte) string {
	if !bytes.HasPrefix(trimmed, []byte("data:")) {
		return ""
	}
	var sb strings.Builder
	scanner := bufio.NewScanner(bytes.NewReader(trimmed))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var chunk chatResponsePayload
		dec := json.NewDecoder(strings.NewReader(payload))
		if err := dec.Decode(&chunk); err == nil && len(chunk.Choices) > 0 {
			c := chunk.Choices[0]
			text := c.Delta.Content
			if text == "" {
				text = c.Message.Content
			}
			sb.WriteString(text)
		}
	}
	return strings.TrimSpace(sb.String())
}

func extractChoiceContent(first chatChoice) string {
	candidates := []string{
		first.Message.Content,
		first.Message.ReasoningContent,
		first.Message.Reasoning,
		first.Delta.Content,
	}
	for _, text := range candidates {
		if trimmed := strings.TrimSpace(text); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

// parseChatResponse extracts translated text from OpenAI response.
func parseChatResponse(bodyBytes []byte) (string, error) {
	trimmed := bytes.TrimSpace(bodyBytes)
	if len(trimmed) == 0 {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, "empty response from AI gateway")
	}

	if sseText := parseSSEResponse(trimmed); sseText != "" {
		return sseText, nil
	}

	var chatResp chatResponsePayload
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	if err := dec.Decode(&chatResp); err != nil {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, "invalid JSON response from AI gateway").WithCause(err)
	}

	if chatResp.Error != nil && chatResp.Error.Message != "" {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, chatResp.Error.Message)
	}

	if len(chatResp.Choices) == 0 {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, "empty response from AI gateway")
	}

	content := extractChoiceContent(chatResp.Choices[0])
	if content == "" {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, "empty response content from AI gateway")
	}

	return content, nil
}

func (s *Service) getDecryptedAPIKey(apiKey string) string {
	if apiKey != "" && s.cipher != nil {
		if dec, decErr := s.cipher.Decrypt(apiKey); decErr == nil {
			return dec
		}
	}
	return apiKey
}

func (s *Service) sendChatRequest(ctx context.Context, endpoint, apiKey string, jsonBytes []byte) ([]byte, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, apperror.Internal(i18n.ErrInternal).WithCause(err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, err.Error()).WithCause(err)
	}
	defer func() {
		if cErr := resp.Body.Close(); cErr != nil {
			log.Printf("close ai resp body err: %v", cErr)
		}
	}()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, apperror.Internal(i18n.ErrInternal).WithCause(err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, fmt.Sprintf("status %d: %s", resp.StatusCode, string(bodyBytes)))
	}

	return bodyBytes, nil
}

// Translate translates the given text into targetLang using OpenAI-compatible chat completion.
func (s *Service) Translate(ctx context.Context, text, targetLang string) (string, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", nil
	}

	cfg, err := s.store.GetAIConfig(ctx)
	if err != nil || !cfg.IsEnabled {
		return "", apperror.BadRequest(i18n.ErrAINotEnabled)
	}

	model, err := resolveModel(cfg)
	if err != nil {
		return "", err
	}

	jsonBytes, err := buildRequestBody(model, text, targetLang)
	if err != nil {
		return "", apperror.Internal(i18n.ErrInternal).WithCause(err)
	}

	apiKey := s.getDecryptedAPIKey(cfg.ApiKey)
	endpoint := buildEndpoint(cfg.BaseUrl)

	bodyBytes, err := s.sendChatRequest(ctx, endpoint, apiKey, jsonBytes)
	if err != nil {
		return "", err
	}

	return parseChatResponse(bodyBytes)
}

func resolvePurposeModel(purpose string, cfg db.AiConfig) string {
	switch strings.ToLower(purpose) {
	case "translate":
		if cfg.ModelTranslate != "" {
			return cfg.ModelTranslate
		}
	case "vision":
		if cfg.ModelVision != "" {
			return cfg.ModelVision
		}
	case "summary":
		if cfg.ModelSummary != "" {
			return cfg.ModelSummary
		}
	}
	return cfg.DefaultModel
}

func (s *Service) resolveTestParams(ctx context.Context, req TestRequest) (string, string, string, error) {
	baseURL := strings.TrimSpace(req.BaseURL)
	apiKey := strings.TrimSpace(req.APIKey)
	model := strings.TrimSpace(req.Model)

	if baseURL != "" && apiKey != "" && model != "" {
		return baseURL, apiKey, model, nil
	}

	cfg, err := s.store.GetAIConfig(ctx)
	if err == nil {
		if baseURL == "" {
			baseURL = cfg.BaseUrl
		}
		if apiKey == "" {
			apiKey = s.getDecryptedAPIKey(cfg.ApiKey)
		}
		if model == "" {
			model = resolvePurposeModel(req.Purpose, cfg)
		}
	}

	if baseURL == "" {
		return "", "", "", apperror.BadRequest(i18n.ErrAIBaseURLMissing)
	}
	if model == "" {
		return "", "", "", apperror.BadRequest(i18n.ErrAIModelMissing)
	}

	return baseURL, apiKey, model, nil
}

// TestConnection tests API connection and specific model response.
func (s *Service) TestConnection(ctx context.Context, req TestRequest) (TestResponse, error) {
	baseURL, apiKey, model, err := s.resolveTestParams(ctx, req)
	if err != nil {
		return TestResponse{Success: false, Error: err.Error()}, err
	}

	endpoint := buildEndpoint(baseURL)
	reqBody := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{
				"role":    "user",
				"content": "ping",
			},
		},
		"max_tokens": 16,
		"stream":     false,
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return TestResponse{Success: false, ModelUsed: model, Error: err.Error()}, nil
	}

	start := time.Now()
	bodyBytes, err := s.sendChatRequest(ctx, endpoint, apiKey, jsonBytes)
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		return TestResponse{
			Success:   false,
			LatencyMs: latencyMs,
			ModelUsed: model,
			Error:     err.Error(),
		}, nil
	}

	reply, err := parseChatResponse(bodyBytes)
	if err != nil {
		return TestResponse{
			Success:   false,
			LatencyMs: latencyMs,
			ModelUsed: model,
			Error:     err.Error(),
		}, nil
	}

	return TestResponse{
		Success:   true,
		LatencyMs: latencyMs,
		ModelUsed: model,
		Reply:     reply,
	}, nil
}

func extractHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

// TestDNS resolves DNS for the AI gateway host.
func (s *Service) TestDNS(ctx context.Context, req DNSTestRequest) (DNSTestResponse, error) {
	raw := strings.TrimSpace(req.BaseURL)
	if raw == "" {
		cfg, err := s.store.GetAIConfig(ctx)
		if err == nil {
			raw = strings.TrimSpace(cfg.BaseUrl)
		}
	}
	if raw == "" {
		return DNSTestResponse{
			Success: false,
			Error:   "base_url is required",
		}, nil
	}

	host := extractHost(raw)
	if host == "" {
		return DNSTestResponse{
			Success: false,
			Error:   "invalid base_url or host",
		}, nil
	}

	start := time.Now()
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		return DNSTestResponse{
			Success:   false,
			Host:      host,
			LatencyMs: latencyMs,
			Error:     err.Error(),
		}, nil
	}

	ips := make([]string, 0, len(addrs))
	for _, addr := range addrs {
		ips = append(ips, addr.IP.String())
	}

	return DNSTestResponse{
		Success:   true,
		Host:      host,
		IPs:       ips,
		LatencyMs: latencyMs,
	}, nil
}
