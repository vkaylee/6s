package ai

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/tidwall/gjson"

	"6s/internal/apperror"
	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/i18n"
)

const (
	timeFormatRFC3339         = "2006-01-02T15:04:05Z07:00"
	defaultHTTPTimeout        = 30 * time.Second
	defaultMinRequestInterval = 1 * time.Second
)

// Store defines persistence operations required for AI management.
type Store interface {
	GetAIConfig(ctx context.Context) (db.AiConfig, error)
	UpsertAIConfig(ctx context.Context, arg db.UpsertAIConfigParams) (db.AiConfig, error)
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
	GetTranslationCache(ctx context.Context, arg db.GetTranslationCacheParams) (db.TranslationCache, error)
	UpsertTranslationCache(ctx context.Context, arg db.UpsertTranslationCacheParams) (db.TranslationCache, error)
	GetIssueByID(ctx context.Context, id int64) (db.Issue, error)
	ListTagsForIssue(ctx context.Context, issueID int64) ([]db.ListTagsForIssueRow, error)
	ListTags(ctx context.Context) ([]db.Tag, error)
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

// TestResponse represents the result of a connectivity or functional model test.
type TestResponse struct {
	Success   bool   `json:"success"`
	LatencyMs int64  `json:"latency_ms"`
	ModelUsed string `json:"model_used"`
	Purpose   string `json:"purpose,omitempty"`
	Check     string `json:"check,omitempty"`
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
	store       Store
	cipher      *crypto.Cipher
	httpClient  *http.Client
	storageDir  string
	minInterval time.Duration
	rateMu      sync.Mutex
	lastCall    time.Time
}

// NewService creates a new Service instance.
func NewService(store Store, cipher *crypto.Cipher, httpClient *http.Client, storageDir string) *Service {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &Service{
		store:       store,
		cipher:      cipher,
		httpClient:  httpClient,
		storageDir:  storageDir,
		minInterval: defaultMinRequestInterval,
	}
}

// SetMinInterval updates the minimum interval between outbound requests.
func (s *Service) SetMinInterval(d time.Duration) {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	s.minInterval = d
}

// waitRateLimit delays execution to guarantee at least minInterval between outbound AI gateway calls.
func (s *Service) waitRateLimit(ctx context.Context) error {
	s.rateMu.Lock()
	interval := s.minInterval
	if interval <= 0 {
		s.rateMu.Unlock()
		return nil
	}

	now := time.Now()
	scheduled := now
	if s.lastCall.After(now) {
		scheduled = s.lastCall.Add(interval)
	} else if wait := interval - now.Sub(s.lastCall); wait > 0 {
		scheduled = now.Add(wait)
	}
	s.lastCall = scheduled
	s.rateMu.Unlock()

	delay := time.Until(scheduled)
	if delay <= 0 {
		return nil
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
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

// normalizeBaseURL ensures the base URL points to a standard OpenAI-compatible base.
func normalizeBaseURL(raw string) string {
	ep := strings.TrimRight(strings.TrimSpace(raw), "/")
	if ep == "" {
		return ""
	}
	if u, err := url.Parse(ep); err == nil && (u.Path == "" || u.Path == "/") {
		ep += "/v1"
	}
	return ep + "/"
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

// ComputeContentHash returns SHA256 hex digest of the trimmed text.
func ComputeContentHash(text string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(text)))
	return hex.EncodeToString(sum[:])
}

// NormalizeLangCode converts varied language codes into standard 'vi', 'zh', or 'en'.
func NormalizeLangCode(lang string) string {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "zh", "zh-cn", "zh-tw":
		return "zh"
	case "en":
		return "en"
	default:
		return "vi"
	}
}

func computeContentHash(text string) string { return ComputeContentHash(text) }
func normalizeLangCode(lang string) string  { return NormalizeLangCode(lang) }

func (s *Service) newOpenAIClient(baseURL, apiKey string) openai.Client {
	opts := []option.RequestOption{
		option.WithBaseURL(normalizeBaseURL(baseURL)),
	}
	if apiKey != "" {
		opts = append(opts, option.WithAPIKey(apiKey))
	}
	if s.httpClient != nil {
		opts = append(opts, option.WithHTTPClient(s.httpClient))
	}
	return openai.NewClient(opts...)
}

func extractMessageContent(completion *openai.ChatCompletion) string {
	if len(completion.Choices) == 0 {
		return ""
	}
	content := strings.TrimSpace(completion.Choices[0].Message.Content)
	if content != "" {
		return content
	}
	raw := completion.RawJSON()
	if raw != "" {
		if val := strings.TrimSpace(gjson.Get(raw, "choices.0.message.reasoning_content").String()); val != "" {
			return val
		}
		if val := strings.TrimSpace(gjson.Get(raw, "choices.0.message.reasoning").String()); val != "" {
			return val
		}
	}
	return ""
}

func (s *Service) getDecryptedAPIKey(apiKey string) string {
	if apiKey != "" && s.cipher != nil {
		if dec, decErr := s.cipher.Decrypt(apiKey); decErr == nil {
			return dec
		}
	}
	return apiKey
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

	contentHash := computeContentHash(text)
	langCode := normalizeLangCode(targetLang)

	if cached, cacheErr := s.store.GetTranslationCache(ctx, db.GetTranslationCacheParams{
		ContentHash: contentHash,
		TargetLang:  langCode,
	}); cacheErr == nil && cached.TranslatedText != "" {
		return cached.TranslatedText, nil
	}

	baseURL := strings.TrimSpace(cfg.BaseUrl)
	if baseURL == "" {
		return "", apperror.BadRequest(i18n.ErrAIBaseURLMissing)
	}

	model, err := resolveModel(cfg)
	if err != nil {
		return "", err
	}

	apiKey := s.getDecryptedAPIKey(cfg.ApiKey)
	client := s.newOpenAIClient(baseURL, apiKey)
	langName := resolveTargetLang(targetLang)

	if waitErr := s.waitRateLimit(ctx); waitErr != nil {
		if errors.Is(waitErr, context.DeadlineExceeded) {
			return "", apperror.New(http.StatusGatewayTimeout, "GATEWAY_TIMEOUT", i18n.ErrInternal, "timeout waiting for AI gateway rate limit slot").WithCause(waitErr)
		}
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, waitErr.Error()).WithCause(waitErr)
	}

	completion, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage("You are a professional factory 6S issue translator. Translate the text into " + langName + ". Maintain manufacturing terminology, location codes, and tags. Return ONLY the translated text without extra formatting, notes, or explanations."),
			openai.UserMessage(text),
		},
		Model:       model,
		Temperature: openai.Float(0.1),
	})
	if err != nil {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, err.Error()).WithCause(err)
	}

	content := extractMessageContent(completion)
	if content == "" {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAITranslateFailed, "empty response content from AI gateway")
	}

	if _, saveErr := s.store.UpsertTranslationCache(ctx, db.UpsertTranslationCacheParams{
		ContentHash:    contentHash,
		TargetLang:     langCode,
		SourceText:     text,
		TranslatedText: content,
	}); saveErr != nil {
		log.Printf("failed to save translation cache: %v", saveErr)
	}

	return content, nil
}

// GetCachedTranslation checks if a translation already exists in the cache.
func (s *Service) GetCachedTranslation(ctx context.Context, text, targetLang string) (string, bool, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", false, nil
	}

	contentHash := computeContentHash(text)
	langCode := normalizeLangCode(targetLang)

	cached, err := s.store.GetTranslationCache(ctx, db.GetTranslationCacheParams{
		ContentHash: contentHash,
		TargetLang:  langCode,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, nil
		}
		return "", false, err
	}

	if cached.TranslatedText != "" {
		return cached.TranslatedText, true, nil
	}
	return "", false, nil
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

// functionalTestPrompts holds a per-purpose probe that exercises the exact task
// the model is configured for, so a Test "pass" means the model can do the job.
var functionalTestPrompts = map[string]functionalProbe{
	"translate": {
		system: "You are a professional translator. Translate the user's text. Return ONLY the translated text with no explanations, notes, or quotes.",
		user:   "Trạm nội thất bị bụi bẩn trên bàn làm việc, tệp tài liệu rơi lộn xộn dưới sàn",
	},
	"summary": {
		system: "You summarize text concisely. Return ONLY one single-sentence summary in Vietnamese with no preamble or quotes.",
		user:   "Hôm nay khối sản xuất A phát hiện 4 vấn đề: sàn tổ khu vực hàn nhiều bụi và kim loại rời; ba hộp dụng cụ chưa trả về đúng vị trí sau ca; một bình chữa cháy hết hạn cần thay mới; lối đi thoát hiểm bị pallet hàng chắn một phần. Trưởng ca đã nhắc nhở tổ trực và hẹn kiểm tra lại vào cuối tuần.",
	},
	"vision": {
		system: "You describe images accurately and concisely. Answer the user's question directly.",
		user:   "What is the dominant color of this image? Answer with one word.",
	},
}

type functionalProbe struct {
	system string
	user   string
}

// testImageRedPNG is a 64x64 solid red PNG for the vision probe (data URI).
const testImageRedPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACahnXAAAAAOElEQVR4nO3PQQ0AMAgEQXCf7l1QN2ZgIKDzb0YzAwCQmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZkBJ04C4AF+dwEAAAAASUVORK5CYII="

func isRefusalLike(reply string) bool {
	r := strings.ToLower(strings.TrimSpace(reply))
	if len(r) > 400 {
		return false
	}
	for _, p := range []string{
		"i'm sorry", "i am sorry", "i can't", "i cannot", "i can not",
		"as an ai", "sorry, but", "对不起", "抱歉", "无法", "我不能",
	} {
		if strings.Contains(r, p) {
			return true
		}
	}
	return false
}

func hasCJK(s string) bool {
	for _, rn := range s {
		if (rn >= 0x4E00 && rn <= 0x9FFF) || (rn >= 0x3400 && rn <= 0x4DBF) {
			return true
		}
	}
	return false
}

func countWords(s string) int {
	return len(strings.Fields(s))
}

// runFunctionalTest executes a purpose-specific probe against the model.
func (s *Service) runFunctionalTest(ctx context.Context, baseURL, apiKey, model, purpose string) (TestResponse, error) {
	probe, ok := functionalTestPrompts[purpose]
	if !ok {
		return s.pingConnection(ctx, baseURL, apiKey, model)
	}
	if waitErr := s.waitRateLimit(ctx); waitErr != nil {
		return TestResponse{Success: false, Purpose: purpose, Error: waitErr.Error()}, waitErr
	}
	client := s.newOpenAIClient(baseURL, apiKey)

	switch purpose {
	case "translate":
		return s.probeTranslate(ctx, client, model, purpose, probe)
	case "summary":
		return s.probeSummary(ctx, client, model, purpose, probe)
	case "vision":
		return s.probeVision(ctx, client, model, purpose, probe)
	}
	return s.pingConnection(ctx, baseURL, apiKey, model)
}

// probeTranslate checks the model can produce Chinese text from a Vietnamese source.
func (s *Service) probeTranslate(ctx context.Context, client openai.Client, model, purpose string, probe functionalProbe) (TestResponse, error) {
	start := time.Now()
	completion, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(probe.system),
			openai.UserMessage(probe.user),
		},
		Model:       model,
		Temperature: openai.Float(0.1),
	})
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "vi→zh translation", Error: err.Error()}, nil
	}
	reply := extractMessageContent(completion)
	switch {
	case strings.TrimSpace(reply) == "":
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "vi→zh translation", Error: "empty response"}, nil
	case isRefusalLike(reply):
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "vi→zh translation", Error: "model refused the task"}, nil
	case hasCJK(reply):
		return TestResponse{Success: true, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "vi→zh translation", Reply: reply}, nil
	case countWords(reply) >= 6:
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "vi→zh translation", Error: "reply is not Chinese text", Reply: reply}, nil
	default:
		// ponytail: accept short non-CJK replies (romanized/edge output); upgrade path: language-detect library.
		return TestResponse{Success: true, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "vi→zh translation", Reply: reply}, nil
	}
}

// probeSummary checks the model can shorten a text without refusing.
func (s *Service) probeSummary(ctx context.Context, client openai.Client, model, purpose string, probe functionalProbe) (TestResponse, error) {
	start := time.Now()
	completion, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(probe.system),
			openai.UserMessage(probe.user),
		},
		Model:       model,
		Temperature: openai.Float(0.2),
	})
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "summarization", Error: err.Error()}, nil
	}
	reply := extractMessageContent(completion)
	switch {
	case strings.TrimSpace(reply) == "":
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "summarization", Error: "empty response"}, nil
	case isRefusalLike(reply):
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "summarization", Error: "model refused the task"}, nil
	case countWords(reply) >= countWords(probe.user)-15 || countWords(reply) < 3 || countWords(reply) > 40:
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "summarization", Error: "summary is not significantly shorter than the source", Reply: reply}, nil
	default:
		return TestResponse{Success: true, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "summarization", Reply: reply}, nil
	}
}

// probeVision checks the model can identify the color of an attached test image.
func (s *Service) probeVision(ctx context.Context, client openai.Client, model, purpose string, probe functionalProbe) (TestResponse, error) {
	start := time.Now()
	completion, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(probe.system),
			openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
				openai.TextContentPart(probe.user),
				openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
					URL:    testImageRedPNG,
					Detail: "low",
				}),
			}),
		},
		Model: model,
	})
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "image understanding", Error: err.Error()}, nil
	}
	reply := extractMessageContent(completion)
	r := strings.ToLower(strings.TrimSpace(reply))
	switch {
	case r == "":
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "image understanding", Error: "empty response"}, nil
	case isRefusalLike(reply):
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "image understanding", Error: "model refused the task"}, nil
	case strings.Contains(r, "red"):
		return TestResponse{Success: true, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "image understanding", Reply: reply}, nil
	default:
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Purpose: purpose, Check: "image understanding", Error: "model did not identify the red test image", Reply: reply}, nil
	}
}

// pingConnection sends a minimal chat completion to verify reachability and auth.
func (s *Service) pingConnection(ctx context.Context, baseURL, apiKey, model string) (TestResponse, error) {
	if waitErr := s.waitRateLimit(ctx); waitErr != nil {
		return TestResponse{Success: false, Error: waitErr.Error()}, waitErr
	}
	client := s.newOpenAIClient(baseURL, apiKey)
	start := time.Now()
	completion, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("ping"),
		},
		Model: model,
	})
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		return TestResponse{Success: false, LatencyMs: latencyMs, ModelUsed: model, Error: err.Error()}, nil
	}
	return TestResponse{
		Success:   true,
		LatencyMs: latencyMs,
		ModelUsed: model,
		Reply:     extractMessageContent(completion),
	}, nil
}

// TestConnection verifies the AI gateway and, for purpose-specific requests,
// runs a functional probe proving the model can perform that exact task.
func (s *Service) TestConnection(ctx context.Context, req TestRequest) (TestResponse, error) {
	baseURL, apiKey, model, err := s.resolveTestParams(ctx, req)
	if err != nil {
		return TestResponse{Success: false, Error: err.Error()}, err
	}
	purpose := strings.ToLower(strings.TrimSpace(req.Purpose))
	resp, err := s.runFunctionalTest(ctx, baseURL, apiKey, model, purpose)
	if err != nil {
		if resp.Error == "" {
			resp.Error = err.Error()
		}
		return resp, err
	}
	resp.Purpose = purpose
	return resp, nil
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

// Review verdict values.
const (
	ReviewVerdictOK       = "OK"
	ReviewVerdictReview   = "REVIEW"
	ReviewVerdictMismatch = "MISMATCH"
)

const (
	reviewMaxFeedbackRunes    = 1200
	reviewMaxSuggestedTags    = 5
	reviewTagCatalogLimit     = 200
	reviewPhotoMaxBytes       = 2*1024*1024 + 1024 // storage cap is 2MB per photo
	reviewDescriptionMaxRunes = 4000
)

// ReviewRequest defines input for POST /api/ai/review.
type ReviewRequest struct {
	IssueID int64  `json:"issue_id"`
	Lang    string `json:"lang"`
}

// FollowUpRequest defines input for POST /api/ai/review-follow-up.
type FollowUpRequest struct {
	IssueID  int64  `json:"issue_id"`
	Lang     string `json:"lang"`
	Question string `json:"question"`
}

type FollowUpResponse struct {
	Answer string `json:"answer"`
}

const (
	reviewMaxSuggestedQuestions = 5
	reviewMaxQuestionRunes      = 500
)

// ReviewSuggestion holds AI-proposed corrections; empty fields mean "keep as is".
type ReviewSuggestion struct {
	Category  string   `json:"category,omitempty"`
	CauseType string   `json:"cause_type,omitempty"`
	Tags      []string `json:"tags,omitempty"`
}

// ReviewResponse is the structured AI verdict for an issue report.
type ReviewResponse struct {
	Verdict            string           `json:"verdict"`
	Feedback           string           `json:"feedback"`
	Suggestion         ReviewSuggestion `json:"suggestion"`
	SuggestedQuestions []string         `json:"suggested_questions,omitempty"`
	Model              string           `json:"model"`
	UsedVision         bool             `json:"used_vision"`
}

// IsEnabled reports whether the AI gateway is active (false on any lookup error).
func (s *Service) IsEnabled(ctx context.Context) bool {
	cfg, err := s.store.GetAIConfig(ctx)
	return err == nil && cfg.IsEnabled
}

// Review asks the configured vision model to audit an issue report
// (evidence photos + description + classification) and return structured feedback.
func (s *Service) Review(ctx context.Context, req ReviewRequest) (ReviewResponse, error) {
	cfg, err := s.store.GetAIConfig(ctx)
	if err != nil || !cfg.IsEnabled {
		return ReviewResponse{}, apperror.BadRequest(i18n.ErrAINotEnabled)
	}
	baseURL := strings.TrimSpace(cfg.BaseUrl)
	if baseURL == "" {
		return ReviewResponse{}, apperror.BadRequest(i18n.ErrAIBaseURLMissing)
	}
	model := strings.TrimSpace(resolvePurposeModel("vision", cfg))
	if model == "" {
		return ReviewResponse{}, apperror.BadRequest(i18n.ErrAIModelMissing)
	}

	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ReviewResponse{}, apperror.NotFound(i18n.ErrIssueNotFound)
		}
		return ReviewResponse{}, reviewStoreError(err)
	}
	selected, err := s.store.ListTagsForIssue(ctx, req.IssueID)
	if err != nil {
		return ReviewResponse{}, reviewStoreError(err)
	}
	catalog, err := s.store.ListTags(ctx)
	if err != nil {
		return ReviewResponse{}, reviewStoreError(err)
	}

	images := s.collectReviewImages(issue)
	prompt := buildReviewPrompt(issue, selected, catalog, resolveTargetLang(req.Lang), len(images) > 0)
	raw, err := s.completeReview(ctx, baseURL, cfg.ApiKey, model, prompt, images)
	if err != nil {
		return ReviewResponse{}, err
	}
	return parseReviewResult(raw, model, issue, selected, catalog, len(images) > 0)
}

// FollowUp answers one bounded question about a completed issue review.
func (s *Service) FollowUp(ctx context.Context, req FollowUpRequest) (FollowUpResponse, error) {
	question := strings.TrimSpace(req.Question)
	if question == "" {
		return FollowUpResponse{}, apperror.BadRequest(i18n.ErrInvalidInput, "question is required")
	}
	if len([]rune(question)) > reviewMaxQuestionRunes {
		return FollowUpResponse{}, apperror.BadRequest(i18n.ErrInvalidInput, "question is too long")
	}
	cfg, err := s.store.GetAIConfig(ctx)
	if err != nil || !cfg.IsEnabled {
		return FollowUpResponse{}, apperror.BadRequest(i18n.ErrAINotEnabled)
	}
	baseURL := strings.TrimSpace(cfg.BaseUrl)
	model := strings.TrimSpace(resolvePurposeModel("vision", cfg))
	if baseURL == "" || model == "" {
		return FollowUpResponse{}, apperror.BadRequest(i18n.ErrAIModelMissing)
	}
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return FollowUpResponse{}, apperror.NotFound(i18n.ErrIssueNotFound)
		}
		return FollowUpResponse{}, reviewStoreError(err)
	}
	selected, err := s.store.ListTagsForIssue(ctx, req.IssueID)
	if err != nil {
		return FollowUpResponse{}, reviewStoreError(err)
	}
	catalog, err := s.store.ListTags(ctx)
	if err != nil {
		return FollowUpResponse{}, reviewStoreError(err)
	}
	images := s.collectReviewImages(issue)
	system := buildReviewPrompt(issue, selected, catalog, resolveTargetLang(req.Lang), len(images) > 0)
	system += "\n\nAnswer the user's follow-up question about this review. Do not modify the issue. Keep the answer concise and write entirely in the requested language.\n"
	answer, err := s.completeFollowUp(ctx, baseURL, cfg.ApiKey, model, system, question, images)
	if err != nil {
		return FollowUpResponse{}, err
	}
	return FollowUpResponse{Answer: answer}, nil
}

func (s *Service) completeFollowUp(ctx context.Context, baseURL, apiKey, model, system, question string, images []openai.ChatCompletionContentPartUnionParam) (string, error) {
	client := s.newOpenAIClient(baseURL, s.getDecryptedAPIKey(apiKey))
	if waitErr := s.waitRateLimit(ctx); waitErr != nil {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAIReviewFailed, waitErr.Error()).WithCause(waitErr)
	}
	userMsg := openai.UserMessage(question)
	if len(images) > 0 {
		parts := append([]openai.ChatCompletionContentPartUnionParam{openai.TextContentPart(question)}, images...)
		userMsg = openai.UserMessage(parts)
	}
	completion, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages:    []openai.ChatCompletionMessageParamUnion{openai.SystemMessage(system), userMsg},
		Model:       model,
		Temperature: openai.Float(0.2),
	})
	if err != nil {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAIReviewFailed, err.Error()).WithCause(err)
	}
	answer := strings.TrimSpace(extractMessageContent(completion))
	if runes := []rune(answer); len(runes) > reviewMaxFeedbackRunes {
		answer = string(runes[:reviewMaxFeedbackRunes])
	}
	return answer, nil
}

// completeReview performs the rate-limited vision chat completion for a review.
func (s *Service) completeReview(ctx context.Context, baseURL, apiKey, model, prompt string, images []openai.ChatCompletionContentPartUnionParam) (string, error) {
	client := s.newOpenAIClient(baseURL, s.getDecryptedAPIKey(apiKey))
	if waitErr := s.waitRateLimit(ctx); waitErr != nil {
		if errors.Is(waitErr, context.DeadlineExceeded) {
			return "", apperror.New(http.StatusGatewayTimeout, "GATEWAY_TIMEOUT", i18n.ErrInternal, "timeout waiting for AI gateway rate limit slot").WithCause(waitErr)
		}
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAIReviewFailed, waitErr.Error()).WithCause(waitErr)
	}

	userMsg := openai.UserMessage("Review the submission described in the system instructions.")
	if len(images) > 0 {
		parts := append([]openai.ChatCompletionContentPartUnionParam{
			openai.TextContentPart("Review this submission against the attached evidence photos (overview first, then close-up)."),
		}, images...)
		userMsg = openai.UserMessage(parts)
	}

	completion, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(prompt),
			userMsg,
		},
		Model:          model,
		Temperature:    openai.Float(0.2),
		ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{OfJSONObject: &openai.ResponseFormatJSONObjectParam{}},
	})
	if err != nil {
		return "", apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAIReviewFailed, err.Error()).WithCause(err)
	}
	return extractMessageContent(completion), nil
}

// parseReviewResult validates the model's JSON verdict and clamps it to known codes.
func parseReviewResult(raw, model string, issue db.Issue, selected []db.ListTagsForIssueRow, catalog []db.Tag, usedVision bool) (ReviewResponse, error) {
	var out struct {
		Verdict            string   `json:"verdict"`
		Feedback           string   `json:"feedback"`
		SuggestedCategory  string   `json:"suggested_category"`
		SuggestedCause     string   `json:"suggested_cause_type"`
		SuggestedTags      []string `json:"suggested_tags"`
		SuggestedQuestions []string `json:"suggested_questions"`
	}
	if err := json.Unmarshal([]byte(extractJSONObject(raw)), &out); err != nil {
		return ReviewResponse{}, apperror.New(http.StatusBadGateway, "AI_GATEWAY_ERROR", i18n.ErrAIReviewFailed, "model returned invalid review JSON")
	}

	verdict := strings.ToUpper(strings.TrimSpace(out.Verdict))
	switch verdict {
	case ReviewVerdictOK, ReviewVerdictReview, ReviewVerdictMismatch:
	default:
		verdict = ReviewVerdictReview
	}
	feedback := strings.TrimSpace(out.Feedback)
	if r := []rune(feedback); len(r) > reviewMaxFeedbackRunes {
		feedback = string(r[:reviewMaxFeedbackRunes])
	}

	resp := ReviewResponse{Verdict: verdict, Feedback: feedback, Model: model, UsedVision: usedVision}
	if cat := strings.ToUpper(strings.TrimSpace(out.SuggestedCategory)); cat != issue.Category && validReviewCategory(cat) {
		resp.Suggestion.Category = cat
	}
	if ct := strings.ToUpper(strings.TrimSpace(out.SuggestedCause)); ct != issue.CauseType && (ct == "CONDITION" || ct == "BEHAVIOR") {
		resp.Suggestion.CauseType = ct
	}
	resp.Suggestion.Tags = filterReviewTags(out.SuggestedTags, selected, catalog)
	resp.SuggestedQuestions = filterSuggestedQuestions(out.SuggestedQuestions)
	return resp, nil
}

func filterSuggestedQuestions(questions []string) []string {
	out := make([]string, 0, reviewMaxSuggestedQuestions)
	seen := make(map[string]struct{}, len(questions))
	for _, question := range questions {
		question = strings.TrimSpace(question)
		if question == "" || len([]rune(question)) > reviewMaxQuestionRunes {
			continue
		}
		if _, ok := seen[question]; ok {
			continue
		}
		seen[question] = struct{}{}
		out = append(out, question)
		if len(out) == reviewMaxSuggestedQuestions {
			break
		}
	}
	return out
}

func reviewStoreError(err error) *apperror.AppError {
	return apperror.New(http.StatusBadGateway, "AI_REVIEW_FAILED", i18n.ErrAIReviewFailed, err.Error()).WithCause(err)
}

func validReviewCategory(c string) bool {
	switch c {
	case "1S", "2S", "3S", "4S", "5S", "6S":
		return true
	default:
		return false
	}
}

// filterReviewTags keeps only catalog codes the report does not already have.
func filterReviewTags(suggested []string, selected []db.ListTagsForIssueRow, catalog []db.Tag) []string {
	have := make(map[string]bool, len(selected))
	for _, t := range selected {
		have[t.Code] = true
	}
	known := make(map[string]bool, len(catalog))
	for _, t := range catalog {
		known[t.Code] = true
	}
	out := make([]string, 0, reviewMaxSuggestedTags)
	seen := make(map[string]bool, len(suggested))
	for _, code := range suggested {
		code = strings.TrimSpace(code)
		if code == "" || !known[code] || have[code] || seen[code] {
			continue
		}
		seen[code] = true
		out = append(out, code)
		if len(out) == reviewMaxSuggestedTags {
			break
		}
	}
	return out
}

// extractJSONObject returns the outermost {...} slice of a model reply, tolerating markdown fences.
func extractJSONObject(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start < 0 || end <= start {
		return s
	}
	return s[start : end+1]
}

// collectReviewImages encodes the report evidence photos as base64 data URLs.
// Missing or oversized files are skipped so the review still runs on text alone.
func (s *Service) collectReviewImages(issue db.Issue) []openai.ChatCompletionContentPartUnionParam {
	// ponytail: at most 2 photos (before + detail); prealloc keeps linter quiet without complexity.
	parts := make([]openai.ChatCompletionContentPartUnionParam, 0, 2)
	for _, p := range []struct{ folder, name string }{
		{"before", issue.PhotoBefore},
		{"detail", issue.PhotoDetail.String},
	} {
		data, mime, ok := readReviewPhoto(s.storageDir, p.folder, p.name)
		if !ok {
			continue
		}
		parts = append(parts, openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
			URL:    "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data),
			Detail: "low",
		}))
	}
	return parts
}

func readReviewPhoto(baseDir, folder, name string) ([]byte, string, bool) {
	if baseDir == "" || name == "" {
		return nil, "", false
	}
	// Stored names are server-generated "<uuid>[_wide|_detail].<ext>"; Base guards against traversal.
	clean := filepath.Base(name)
	// ponytail: name is server-generated (not user-controlled), Base() strips any path; safe to read.
	data, err := os.ReadFile(filepath.Join(baseDir, folder, clean)) // #nosec G304 -- server-controlled filename
	if err != nil || len(data) == 0 || len(data) > reviewPhotoMaxBytes {
		return nil, "", false
	}
	mime := "image/jpeg"
	if strings.HasSuffix(strings.ToLower(clean), ".png") {
		mime = "image/png"
	}
	return data, mime, true
}

const reviewCategoryGuide = `6S category definitions:
- 1S Sort: unnecessary items, scrap, obsolete materials mixed with what is needed
- 2S Set in Order: items out of place, missing labels/demarcation, blocked flow
- 3S Shine: dirt, dust, spills, leaks, corrosion, unclean equipment or surroundings
- 4S Standardize: missing/faded/broken visual standards, gauges, checklists, signage
- 5S Sustain: people-behavior issues: dress code, SOP violations, discipline lapses
- 6S Safety: physical hazards, fire/electrical risk, missing machine guards, PPE failures`

// buildReviewPrompt assembles the audit instructions, including the tag vocabulary
// so the model can only suggest codes that exist in the system.
func buildReviewPrompt(issue db.Issue, selected []db.ListTagsForIssueRow, catalog []db.Tag, langName string, hasPhotos bool) string {
	var b strings.Builder
	b.WriteString("You are a strict 6S (Sort, Set in Order, Shine, Standardize, Sustain, Safety) workplace audit assistant covering production floors and office areas alike. ")
	b.WriteString("An employee submitted the issue report below. Judge whether category, cause type, tags and description are accurate and consistent with the evidence, and propose corrections.\n\n")
	b.WriteString("REPORT UNDER REVIEW\n")
	fmt.Fprintf(&b, "- Category: %s\n", issue.Category)
	fmt.Fprintf(&b, "- Location: %s\n", issue.LocationCode)
	desc := []rune(strings.TrimSpace(issue.Description.String))
	if len(desc) > reviewDescriptionMaxRunes {
		desc = desc[:reviewDescriptionMaxRunes]
	}
	fmt.Fprintf(&b, "- Description: %q\n", string(desc))
	if len(selected) == 0 {
		b.WriteString("- Selected tags: (none)\n")
	} else {
		b.WriteString("- Selected tags: ")
		for i, t := range selected {
			if i > 0 {
				b.WriteString(", ")
			}
			fmt.Fprintf(&b, "%s(%s)", t.Code, t.NameVi)
		}
		b.WriteString("\n")
	}
	b.WriteString("\n" + reviewCategoryGuide + "\n\n")
	b.WriteString("TAG CATALOG (use ONLY these codes in suggestions):\n")
	for i, t := range catalog {
		if i >= reviewTagCatalogLimit {
			break
		}
		fmt.Fprintf(&b, "- %s | %s | %s | %s | %s\n", t.Code, t.NameVi, t.NameZh, t.NameEn, t.Category)
	}
	b.WriteString("\nEVIDENCE: ")
	if hasPhotos {
		b.WriteString("the user message attaches the report's evidence photos (overview first, then close-up). Inspect them.")
	} else {
		b.WriteString("no photos could be loaded; judge text and classification consistency only, and set verdict REVIEW unless the text alone is clearly correct.")
	}
	b.WriteString("\n\nReturn ONLY a JSON object:\n")
	b.WriteString(`{"verdict":"OK"|"REVIEW"|"MISMATCH","feedback":"...","suggested_category":"1S|2S|3S|4S|5S|6S or empty","suggested_cause_type":"CONDITION|BEHAVIOR or empty","suggested_tags":["CODE",...],"suggested_questions":["contextual question 1",...]}`)
	b.WriteString("\nRules:\n")
	b.WriteString("- OK: everything matches the evidence. REVIEW: plausible but uncertain or incomplete. MISMATCH: classification or report clearly contradicts the evidence.\n")
	b.WriteString("- suggested_* fields: fill ONLY when the correction clearly improves the report; leave empty or [] otherwise.\n")
	b.WriteString("- suggested_tags: at most 3 codes from the TAG CATALOG, not already selected.\n")
	b.WriteString("- suggested_questions: return 3 to 5 concise follow-up questions tailored to this report, its location, evidence, verdict and suggestions; return [] only if no useful question exists. Do not repeat the report verbatim.\n")
	b.WriteString("- feedback: at most 3 sentences addressed to the reporter; state what matches or what is wrong and why; write entirely in " + langName + ".")
	return b.String()
}
