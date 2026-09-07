package ai

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/openai/openai-go"

	"6s/internal/apperror"
	"6s/internal/crypto"
	"6s/internal/db"
)

// testCategory1S mirrors issue.Category1S; importing the issue package here
// would create an import cycle in tests.
const testCategory1S = "1S"

type mockStore struct {
	cfg       db.AiConfig
	cfgErr    error
	upsertErr error
	auditLogs []db.InsertAuditLogParams
	cache     map[string]db.TranslationCache
	issue     *db.Issue
	issueErr  error
	issueTags []db.ListTagsForIssueRow
	tags      []db.Tag
}

func (m *mockStore) GetAIConfig(_ context.Context) (db.AiConfig, error) {
	if m.cfgErr != nil {
		return db.AiConfig{}, m.cfgErr
	}
	return m.cfg, nil
}

func (m *mockStore) UpsertAIConfig(_ context.Context, arg db.UpsertAIConfigParams) (db.AiConfig, error) {
	if m.upsertErr != nil {
		return db.AiConfig{}, m.upsertErr
	}
	apiKey := arg.ApiKey
	if apiKey == "" {
		apiKey = m.cfg.ApiKey
	}
	m.cfg = db.AiConfig{
		ID:             1,
		IsEnabled:      arg.IsEnabled,
		BaseUrl:        arg.BaseUrl,
		ApiKey:         apiKey,
		DefaultModel:   arg.DefaultModel,
		ModelTranslate: arg.ModelTranslate,
		ModelVision:    arg.ModelVision,
		ModelSummary:   arg.ModelSummary,
		UpdatedAt:      time.Now(),
		UpdatedBy:      arg.UpdatedBy,
	}
	return m.cfg, nil
}

func (m *mockStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	m.auditLogs = append(m.auditLogs, arg)
	return nil
}
func (m *mockStore) GetTranslationCache(_ context.Context, arg db.GetTranslationCacheParams) (db.TranslationCache, error) {
	if m.cache != nil {
		if val, ok := m.cache[arg.ContentHash+":"+arg.TargetLang]; ok {
			return val, nil
		}
	}
	return db.TranslationCache{}, sql.ErrNoRows
}

func (m *mockStore) UpsertTranslationCache(_ context.Context, arg db.UpsertTranslationCacheParams) (db.TranslationCache, error) {
	if m.cache == nil {
		m.cache = make(map[string]db.TranslationCache)
	}
	res := db.TranslationCache{
		ContentHash:    arg.ContentHash,
		TargetLang:     arg.TargetLang,
		SourceText:     arg.SourceText,
		TranslatedText: arg.TranslatedText,
		CreatedAt:      time.Now(),
	}
	m.cache[arg.ContentHash+":"+arg.TargetLang] = res
	return res, nil
}

func (m *mockStore) GetIssueByID(_ context.Context, id int64) (db.Issue, error) {
	if m.issueErr != nil {
		return db.Issue{}, m.issueErr
	}
	if m.issue == nil || m.issue.ID != id {
		return db.Issue{}, sql.ErrNoRows
	}
	return *m.issue, nil
}

func (m *mockStore) ListTagsForIssue(_ context.Context, _ int64) ([]db.ListTagsForIssueRow, error) {
	return m.issueTags, nil
}

func (m *mockStore) ListTags(_ context.Context) ([]db.Tag, error) {
	return m.tags, nil
}

func TestTranslate_FallbackToDefaultModel(t *testing.T) {
	var requestedModel string
	var authHeader string

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if m, ok := body["model"].(string); ok {
			requestedModel = m
		}

		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "Khu vực sản xuất bừa bộn",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	store := &mockStore{
		cfg: db.AiConfig{
			ID:             1,
			IsEnabled:      true,
			BaseUrl:        mockServer.URL,
			ApiKey:         "test-secret-key",
			DefaultModel:   "gpt-4o-mini",
			ModelTranslate: "", // Empty: should fallback to default_model
		},
	}

	svc := NewService(store, nil, mockServer.Client(), "")

	translated, err := svc.Translate(context.Background(), "生产现场杂乱", "vi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if translated != "Khu vực sản xuất bừa bộn" {
		t.Errorf("expected translation %q, got %q", "Khu vực sản xuất bừa bộn", translated)
	}

	if requestedModel != "gpt-4o-mini" {
		t.Errorf("expected model fallback to gpt-4o-mini, got %q", requestedModel)
	}

	if authHeader != "Bearer test-secret-key" {
		t.Errorf("expected auth header 'Bearer test-secret-key', got %q", authHeader)
	}
}

func TestTranslate_UsePurposeModelWhenConfigured(t *testing.T) {
	var requestedModel string

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if m, ok := body["model"].(string); ok {
			requestedModel = m
		}

		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "Oil leak detected on machine #3",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	store := &mockStore{
		cfg: db.AiConfig{
			ID:             1,
			IsEnabled:      true,
			BaseUrl:        mockServer.URL,
			DefaultModel:   "gpt-4o-mini",
			ModelTranslate: "claude-3-5-haiku", // Specific translation model configured
		},
	}

	svc := NewService(store, nil, mockServer.Client(), "")

	translated, err := svc.Translate(context.Background(), "Máy số 3 rò rỉ dầu", "en")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if translated != "Oil leak detected on machine #3" {
		t.Errorf("expected %q, got %q", "Oil leak detected on machine #3", translated)
	}

	if requestedModel != "claude-3-5-haiku" {
		t.Errorf("expected model claude-3-5-haiku, got %q", requestedModel)
	}
}

func TestTranslate_DisabledAI(t *testing.T) {
	store := &mockStore{
		cfg: db.AiConfig{
			ID:        1,
			IsEnabled: false,
		},
	}

	svc := NewService(store, nil, nil, "")
	_, err := svc.Translate(context.Background(), "hello", "vi")
	if err == nil {
		t.Fatal("expected error when AI is disabled, got nil")
	}
}

func TestTranslate_MissingModel(t *testing.T) {
	store := &mockStore{
		cfg: db.AiConfig{
			ID:             1,
			IsEnabled:      true,
			BaseUrl:        "http://example.com",
			DefaultModel:   "",
			ModelTranslate: "",
		},
	}

	svc := NewService(store, nil, nil, "")
	_, err := svc.Translate(context.Background(), "hello", "vi")
	if err == nil {
		t.Fatal("expected error when model is empty, got nil")
	}
}

func TestConfig_UpdateAndGetMasked(t *testing.T) {
	key := "12345678901234567890123456789012"
	cph, err := crypto.NewEncryptor(key)
	if err != nil {
		t.Fatalf("failed to create cipher: %v", err)
	}

	store := &mockStore{
		cfgErr: sql.ErrNoRows,
	}

	svc := NewService(store, cph, nil, "")

	// Get initial when not configured
	getResp, err := svc.GetConfig(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if getResp.IsEnabled {
		t.Errorf("expected IsEnabled false, got true")
	}

	// Update config
	enabled := true
	updateReq := UpdateConfigRequest{
		IsEnabled:      &enabled,
		BaseURL:        "https://ai.internal/v1",
		APIKey:         "secret-key-123",
		DefaultModel:   "gpt-4o-mini",
		ModelTranslate: "deepseek-chat",
	}

	res, err := svc.UpdateConfig(context.Background(), updateReq, 42)
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	if !res.IsEnabled {
		t.Errorf("expected IsEnabled true")
	}
	if !res.HasAPIKey {
		t.Errorf("expected HasAPIKey true")
	}
	if res.ModelTranslate != "deepseek-chat" {
		t.Errorf("expected model_translate 'deepseek-chat', got %s", res.ModelTranslate)
	}

	// Verify key stored in DB is encrypted
	if store.cfg.ApiKey == "secret-key-123" {
		t.Errorf("api key was stored in plaintext")
	}

	// Decrypt verification
	dec, err := cph.Decrypt(store.cfg.ApiKey)
	if err != nil || dec != "secret-key-123" {
		t.Errorf("decryption failed or mismatched: %v, %s", err, dec)
	}
}

func TestTestConnection_Success(t *testing.T) {
	var testedModel string
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if m, ok := body["model"].(string); ok {
			testedModel = m
		}
		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "pong",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	store := &mockStore{
		cfg: db.AiConfig{
			ID:             1,
			IsEnabled:      true,
			BaseUrl:        mockServer.URL,
			DefaultModel:   "gpt-4o-mini",
			ModelTranslate: "deepseek-chat",
		},
	}

	svc := NewService(store, nil, mockServer.Client(), "")

	// Test with specific model
	res, err := svc.TestConnection(context.Background(), TestRequest{
		Model: "claude-3-5-sonnet",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Success || res.Reply != "pong" {
		t.Errorf("expected success true, reply 'pong', got %+v", res)
	}
	if testedModel != "claude-3-5-sonnet" {
		t.Errorf("expected testedModel 'claude-3-5-sonnet', got %s", testedModel)
	}

	// Test purpose translate fallback
	resTrans, err := svc.TestConnection(context.Background(), TestRequest{
		Purpose: "translate",
	})
	if err != nil || !resTrans.Success {
		t.Fatalf("unexpected error on translate purpose test: %v, %+v", err, resTrans)
	}
	if testedModel != "deepseek-chat" {
		t.Errorf("expected testedModel 'deepseek-chat', got %s", testedModel)
	}
}

func TestTestConnection_FunctionalProbes(t *testing.T) {
	var lastSystem, lastUserText string
	var lastHasImage bool
	var reply string
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		lastSystem, lastUserText, lastHasImage = "", "", false
		for _, m := range body.Messages {
			switch m.Role {
			case "system":
				_ = json.Unmarshal(m.Content, &lastSystem)
			case "user":
				var s string
				if err := json.Unmarshal(m.Content, &s); err == nil {
					lastUserText = s
					continue
				}
				var parts []struct {
					Type     string `json:"type"`
					Text     string `json:"text"`
					ImageURL *struct {
						URL string `json:"url"`
					} `json:"image_url"`
				}
				if err := json.Unmarshal(m.Content, &parts); err == nil {
					for _, p := range parts {
						if p.ImageURL != nil {
							lastHasImage = true
						}
						if p.Text != "" {
							lastUserText = p.Text
						}
					}
				}
			}
		}
		resp := map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": reply}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	store := &mockStore{cfg: db.AiConfig{
		ID: 1, IsEnabled: true,
		BaseUrl:        mockServer.URL,
		DefaultModel:   "test-model",
		ModelTranslate: "test-model",
		ModelSummary:   "test-model",
		ModelVision:    "test-model",
	}}
	svc := NewService(store, nil, mockServer.Client(), "")
	ctx := context.Background()

	t.Run("translate success with Chinese output", func(t *testing.T) {
		reply = "室内站工作台上布满灰尘，文件散落一地"
		res, err := svc.TestConnection(ctx, TestRequest{Purpose: "translate"})
		if err != nil || !res.Success {
			t.Fatalf("expected success, got err=%v res=%+v", err, res)
		}
		if lastUserText == "ping" || !strings.Contains(lastSystem, "ranslator") {
			t.Errorf("expected functional translate prompt, got system=%q user=%q", lastSystem, lastUserText)
		}
		if res.Check != "vi→zh translation" {
			t.Errorf("expected check label, got %q", res.Check)
		}
	})

	t.Run("translate fails on non-Chinese echo", func(t *testing.T) {
		reply = "Tram noi that bi bui ban tren ban lam viec, tep tai lieu roi lon xon duoi san"
		res, err := svc.TestConnection(ctx, TestRequest{Purpose: "translate"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Success {
			t.Errorf("expected failure for non-Chinese reply, got %+v", res)
		}
	})

	t.Run("summary success with concise output", func(t *testing.T) {
		reply = "Khu sản xuất có bụi, dụng cụ misplaced, bình chữa cháy hết hạn và lối thoát hiểm bị chắn."
		res, err := svc.TestConnection(ctx, TestRequest{Purpose: "summary"})
		if err != nil || !res.Success {
			t.Fatalf("expected success, got err=%v res=%+v", err, res)
		}
		if lastHasImage {
			t.Errorf("summary probe should not send an image")
		}
	})

	t.Run("summary fails when echoing the source", func(t *testing.T) {
		reply = "Hôm nay khối sản xuất A phát hiện 4 vấn đề: sàn tổ khu vực hàn nhiều bụi và kim loại rời; ba hộp dụng cụ chưa trả về đúng vị trí sau ca; một bình chữa cháy hết hạn cần thay mới; lối đi thoát hiểm bị pallet hàng chắn một phần. Trưởng ca đã nhắc nhở tổ trực và hẹn kiểm tra lại vào cuối tuần."
		res, err := svc.TestConnection(ctx, TestRequest{Purpose: "summary"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Success {
			t.Errorf("expected failure for non-condensing summary, got %+v", res)
		}
	})

	t.Run("vision success with red image", func(t *testing.T) {
		reply = "Red"
		res, err := svc.TestConnection(ctx, TestRequest{Purpose: "vision"})
		if err != nil || !res.Success {
			t.Fatalf("expected success, got err=%v res=%+v", err, res)
		}
		if !lastHasImage {
			t.Errorf("vision probe must include an image part")
		}
	})

	t.Run("vision fails when color wrong", func(t *testing.T) {
		reply = "Blue"
		res, err := svc.TestConnection(ctx, TestRequest{Purpose: "vision"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Success {
			t.Errorf("expected failure for wrong color answer, got %+v", res)
		}
	})
}

func TestService_TestDNS(t *testing.T) {
	cipher, _ := crypto.NewCipher("MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=")
	store := &mockStore{
		cfg: db.AiConfig{
			BaseUrl: "http://localhost:8080/v1",
		},
	}
	svc := NewService(store, cipher, nil, "")

	// 1. Explicit baseURL localhost
	res, err := svc.TestDNS(context.Background(), DNSTestRequest{BaseURL: "https://localhost/v1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Success || res.Host != "localhost" || len(res.IPs) == 0 {
		t.Errorf("expected successful localhost resolution, got %+v", res)
	}

	// 2. Fallback to store BaseUrl
	resStore, err := svc.TestDNS(context.Background(), DNSTestRequest{})
	if err != nil {
		t.Fatalf("unexpected error on store fallback: %v", err)
	}
	if !resStore.Success || resStore.Host != "localhost" {
		t.Errorf("expected successful store resolution, got %+v", resStore)
	}

	// 3. Empty base_url when store has none
	store.cfg.BaseUrl = ""
	resEmpty, _ := svc.TestDNS(context.Background(), DNSTestRequest{})
	if resEmpty.Success || resEmpty.Error == "" {
		t.Errorf("expected failure for empty base_url, got %+v", resEmpty)
	}

	// 4. Invalid host resolution
	resInvalid, _ := svc.TestDNS(context.Background(), DNSTestRequest{BaseURL: "http://invalid-non-existent-domain-12345.local"})
	if resInvalid.Success || resInvalid.Error == "" {
		t.Errorf("expected failure for unresolvable domain, got %+v", resInvalid)
	}
}

func TestExtractMessageContent(t *testing.T) {
	// 1. Standard Content
	comp1 := &openai.ChatCompletion{
		Choices: []openai.ChatCompletionChoice{
			{
				Message: openai.ChatCompletionMessage{
					Content: "Sàn nhà có dầu.",
				},
			},
		},
	}
	if got := extractMessageContent(comp1); got != "Sàn nhà có dầu." {
		t.Errorf("expected 'Sàn nhà có dầu.', got %q", got)
	}

	// 2. Fallback to reasoning_content via RawJSON
	var comp2 openai.ChatCompletion
	rawJSON := `{"choices":[{"message":{"content":"","reasoning_content":"Translated: Line A1"}}]}`
	_ = json.Unmarshal([]byte(rawJSON), &comp2)
	if got := extractMessageContent(&comp2); got != "Translated: Line A1" {
		t.Errorf("expected 'Translated: Line A1', got %q", got)
	}
}

func TestNormalizeBaseURL(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"https://api.openai.com/v1", "https://api.openai.com/v1/"},
		{"https://api.openai.com/v1/", "https://api.openai.com/v1/"},
		{"https://api.openai.com", "https://api.openai.com/v1/"},
		{"https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1/"},
		{"http://localhost:11434/v1", "http://localhost:11434/v1/"},
	}

	for _, c := range cases {
		got := normalizeBaseURL(c.input)
		if got != c.expected {
			t.Errorf("normalizeBaseURL(%q) = %q, expected %q", c.input, got, c.expected)
		}
	}
}

func TestResolvePurposeModel(t *testing.T) {
	cfg := db.AiConfig{
		DefaultModel:   "gpt-4o",
		ModelTranslate: "deepseek-chat",
		ModelVision:    "gpt-4o-vision",
		ModelSummary:   "claude-3-haiku",
	}

	if got := resolvePurposeModel("translate", cfg); got != "deepseek-chat" {
		t.Errorf("expected deepseek-chat, got %s", got)
	}
	if got := resolvePurposeModel("vision", cfg); got != "gpt-4o-vision" {
		t.Errorf("expected gpt-4o-vision, got %s", got)
	}
	if got := resolvePurposeModel("summary", cfg); got != "claude-3-haiku" {
		t.Errorf("expected claude-3-haiku, got %s", got)
	}
	if got := resolvePurposeModel("unknown", cfg); got != "gpt-4o" {
		t.Errorf("expected fallback gpt-4o, got %s", got)
	}
}

func TestResolveTargetLang(t *testing.T) {
	if got := resolveTargetLang("zh"); got != "Simplified Chinese" {
		t.Errorf("expected Simplified Chinese, got %s", got)
	}
	if got := resolveTargetLang("en"); got != "English" {
		t.Errorf("expected English, got %s", got)
	}
	if got := resolveTargetLang("vi"); got != "Vietnamese" {
		t.Errorf("expected Vietnamese, got %s", got)
	}
}

func TestExtractHost(t *testing.T) {
	if got := extractHost("https://ai.example.com/v1"); got != "ai.example.com" {
		t.Errorf("expected ai.example.com, got %s", got)
	}
	if got := extractHost("api.internal.lan:8080/v1"); got != "api.internal.lan" {
		t.Errorf("expected api.internal.lan, got %s", got)
	}
	if got := extractHost(""); got != "" {
		t.Errorf("expected empty string, got %s", got)
	}
}

func TestTranslate_EmptyText(t *testing.T) {
	svc := NewService(&mockStore{}, nil, nil, "")
	res, err := svc.Translate(context.Background(), "   ", "vi")
	if err != nil || res != "" {
		t.Errorf("expected empty result and nil error, got %q, %v", res, err)
	}
}

func TestExtractMessageContent_EdgeCases(t *testing.T) {
	// Empty choices
	if got := extractMessageContent(&openai.ChatCompletion{}); got != "" {
		t.Errorf("expected empty string for no choices, got %q", got)
	}

	// Empty content and no reasoning
	compEmpty := &openai.ChatCompletion{
		Choices: []openai.ChatCompletionChoice{
			{Message: openai.ChatCompletionMessage{Content: ""}},
		},
	}
	if got := extractMessageContent(compEmpty); got != "" {
		t.Errorf("expected empty string for empty message, got %q", got)
	}

	// Reasoning field fallback
	var compReasoning openai.ChatCompletion
	_ = json.Unmarshal([]byte(`{"choices":[{"message":{"content":"","reasoning":"Thinking result"}}]}`), &compReasoning)
	if got := extractMessageContent(&compReasoning); got != "Thinking result" {
		t.Errorf("expected 'Thinking result', got %q", got)
	}
}

func TestWaitRateLimit_Spacing(t *testing.T) {
	svc := NewService(&mockStore{}, nil, nil, "")
	interval := 50 * time.Millisecond
	svc.SetMinInterval(interval)

	start := time.Now()
	if err := svc.waitRateLimit(context.Background()); err != nil {
		t.Fatalf("first call unexpected err: %v", err)
	}
	firstDur := time.Since(start)
	if firstDur >= interval {
		t.Errorf("first call should not be delayed, took %v", firstDur)
	}

	secondStart := time.Now()
	if err := svc.waitRateLimit(context.Background()); err != nil {
		t.Fatalf("second call unexpected err: %v", err)
	}
	secondDur := time.Since(secondStart)
	if secondDur < interval-5*time.Millisecond {
		t.Errorf("second call should wait at least %v, took %v", interval, secondDur)
	}
}

func TestWaitRateLimit_ContextCanceled(t *testing.T) {
	svc := NewService(&mockStore{}, nil, nil, "")
	svc.SetMinInterval(200 * time.Millisecond)

	// Consume first slot
	if err := svc.waitRateLimit(context.Background()); err != nil {
		t.Fatalf("first call unexpected err: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	err := svc.waitRateLimit(ctx)
	if err == nil {
		t.Fatal("expected context cancellation error, got nil")
	}
}

func TestTranslate_RateLimitQueueConcurrent(t *testing.T) {
	var mu sync.Mutex
	var callTimes []time.Time

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		callTimes = append(callTimes, time.Now())
		mu.Unlock()

		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "translated",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	store := &mockStore{
		cfg: db.AiConfig{
			ID:           1,
			IsEnabled:    true,
			BaseUrl:      mockServer.URL,
			ApiKey:       "test-key",
			DefaultModel: "gpt-4o-mini",
		},
	}

	svc := NewService(store, nil, mockServer.Client(), "")
	interval := 80 * time.Millisecond
	svc.SetMinInterval(interval)

	const n = 3
	var wg sync.WaitGroup
	errs := make([]error, n)
	results := make([]string, n)

	for i := range n {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx], errs[idx] = svc.Translate(context.Background(), fmt.Sprintf("text-%d", idx), "vi")
		}(i)
	}
	wg.Wait()

	for i := range n {
		if errs[i] != nil {
			t.Fatalf("request %d failed: %v", i, errs[i])
		}
		if results[i] != "translated" {
			t.Errorf("request %d expected 'translated', got %q", i, results[i])
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if len(callTimes) != n {
		t.Fatalf("expected %d calls, got %d", n, len(callTimes))
	}

	sort.Slice(callTimes, func(i, j int) bool {
		return callTimes[i].Before(callTimes[j])
	})

	for i := 1; i < len(callTimes); i++ {
		gap := callTimes[i].Sub(callTimes[i-1])
		if gap < interval-15*time.Millisecond {
			t.Errorf("gap between calls %d and %d was %v, expected at least %v", i-1, i, gap, interval)
		}
	}
}

func TestTranslate_CacheHit_NoGatewayCall(t *testing.T) {
	gatewayCalled := false
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		gatewayCalled = true
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer mockServer.Close()

	sourceText := "Khu vực bừa bộn"
	cachedTrans := "Messy area"
	hash := computeContentHash(sourceText)

	store := &mockStore{
		cfg: db.AiConfig{
			ID:             1,
			IsEnabled:      true,
			BaseUrl:        mockServer.URL,
			ApiKey:         "token",
			DefaultModel:   "gpt-4o-mini",
			ModelTranslate: "gpt-4o-mini",
		},
		cache: map[string]db.TranslationCache{
			hash + ":en": {
				ContentHash:    hash,
				TargetLang:     "en",
				SourceText:     sourceText,
				TranslatedText: cachedTrans,
			},
		},
	}

	svc := NewService(store, nil, mockServer.Client(), "")
	result, err := svc.Translate(context.Background(), sourceText, "en")
	if err != nil {
		t.Fatalf("expected cache hit with nil error, got %v", err)
	}
	if result != cachedTrans {
		t.Errorf("expected cached translation %q, got %q", cachedTrans, result)
	}
	if gatewayCalled {
		t.Error("gateway should not be called when translation is cached")
	}
}

func TestTranslate_CacheMiss_SavesToCache(t *testing.T) {
	callCount := 0
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		callCount++
		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "Clean area",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	sourceText := "Khu vực sạch sẽ"
	store := &mockStore{
		cfg: db.AiConfig{
			ID:           1,
			IsEnabled:    true,
			BaseUrl:      mockServer.URL,
			ApiKey:       "token",
			DefaultModel: "gpt-4o-mini",
		},
	}

	svc := NewService(store, nil, mockServer.Client(), "")
	// First call: cache miss, calls gateway
	res1, err := svc.Translate(context.Background(), sourceText, "en")
	if err != nil || res1 != "Clean area" {
		t.Fatalf("call 1 failed: res=%q, err=%v", res1, err)
	}
	if callCount != 1 {
		t.Fatalf("expected 1 gateway call, got %d", callCount)
	}

	// Second call: cache hit, no additional gateway call
	res2, err := svc.Translate(context.Background(), sourceText, "en")
	if err != nil || res2 != "Clean area" {
		t.Fatalf("call 2 failed: res=%q, err=%v", res2, err)
	}
	if callCount != 1 {
		t.Fatalf("expected still 1 gateway call (cache hit), got %d", callCount)
	}
}

func TestGetCachedTranslation(t *testing.T) {
	sourceText := "Khu vực để rác"
	cachedText := "Waste storage area"
	hash := computeContentHash(sourceText)

	store := &mockStore{
		cache: map[string]db.TranslationCache{
			hash + ":en": {
				ContentHash:    hash,
				TargetLang:     "en",
				SourceText:     sourceText,
				TranslatedText: cachedText,
			},
		},
	}

	svc := NewService(store, nil, nil, "")

	// 1. Empty text -> false
	res, found, err := svc.GetCachedTranslation(context.Background(), "   ", "en")
	if err != nil || found || res != "" {
		t.Errorf("expected false for empty text, got (%q, %v, %v)", res, found, err)
	}

	// 2. Cache miss -> false
	res, found, err = svc.GetCachedTranslation(context.Background(), "Unknown text", "en")
	if err != nil || found || res != "" {
		t.Errorf("expected false for cache miss, got (%q, %v, %v)", res, found, err)
	}

	// 3. Cache hit -> true
	res, found, err = svc.GetCachedTranslation(context.Background(), sourceText, "en")
	if err != nil || !found || res != cachedText {
		t.Errorf("expected (%q, true, nil), got (%q, %v, %v)", cachedText, res, found, err)
	}
}

func reviewTestFixture(gatewayURL, storageDir string) *mockStore {
	if storageDir != "" {
		// Fake evidence photos so collectReviewImages picks them up.
		if err := os.MkdirAll(filepath.Join(storageDir, "before"), 0o755); err == nil {
			_ = os.WriteFile(filepath.Join(storageDir, "before", "11111111-1111-1111-1111-111111111111_wide.jpg"), []byte{0xFF, 0xD8, 0xFF, 0xE0}, 0o600)
		}
		if err := os.MkdirAll(filepath.Join(storageDir, "detail"), 0o755); err == nil {
			_ = os.WriteFile(filepath.Join(storageDir, "detail", "11111111-1111-1111-1111-111111111111_detail.jpg"), []byte{0xFF, 0xD8, 0xFF, 0xE0}, 0o600)
		}
	}
	return &mockStore{
		cfg: db.AiConfig{
			ID:           1,
			IsEnabled:    true,
			BaseUrl:      gatewayURL,
			ApiKey:       "test-secret-key",
			DefaultModel: "gpt-4o-mini",
		},
		issue: &db.Issue{
			ID:          7,
			Category:    "3S",
			Description: sql.NullString{String: "Floor covered in dust and metal chips", Valid: true},
			PhotoDetail: sql.NullString{String: "11111111-1111-1111-1111-111111111111_detail.jpg", Valid: true},
			PhotoBefore: "11111111-1111-1111-1111-111111111111_wide.jpg",
		},
		issueTags: []db.ListTagsForIssueRow{
			{Code: "DIRT", NameVi: "Bụi bẩn", Category: "3S"},
			{Code: "SCRAP", NameVi: "Vật tư thừa", Category: "1S"},
		},
		tags: []db.Tag{
			{Code: "DIRT", NameVi: "Bụi bẩn", Category: "3S"},
			{Code: "OIL_LEAK", NameVi: "Rò rỉ dầu", Category: "3S"},
			{Code: "SCRAP", NameVi: "Vật tư thừa", Category: "1S"},
		},
	}
}

func TestReview_HappyPath(t *testing.T) {
	// Minimal JPEG header suffices: readReviewPhoto only checks size and extension.
	storageDir := t.TempDir()
	for _, rel := range []string{"before/11111111-1111-1111-1111-111111111111_wide.jpg", "detail/11111111-1111-1111-1111-111111111111_detail.jpg"} {
		p := filepath.Join(storageDir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10}, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var seenImageParts int
	var requestedModel string
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model    string `json:"model"`
			Messages []struct {
				Content []struct {
					Type     string `json:"type"`
					ImageURL *struct {
						URL string `json:"url"`
					} `json:"image_url"`
				} `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		requestedModel = body.Model
		for _, m := range body.Messages {
			for _, p := range m.Content {
				if p.Type == "image_url" && p.ImageURL != nil && strings.HasPrefix(p.ImageURL.URL, "data:image/jpeg;base64,") {
					seenImageParts++
				}
			}
		}
		resp := map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{
					"content": `{"verdict":"MISMATCH","feedback":"Sản phẩm thừa chưa phân loại.","suggested_category":"1S","suggested_tags":["SCRAP","OIL_LEAK","SCRAP","UNKNOWN"]}`,
				}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	store := reviewTestFixture(mockServer.URL, storageDir)
	svc := NewService(store, nil, mockServer.Client(), storageDir)
	svc.SetMinInterval(0)

	res, err := svc.Review(context.Background(), ReviewRequest{IssueID: 7, Lang: "vi"})
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if res.Verdict != ReviewVerdictMismatch {
		t.Errorf("verdict = %q, want MISMATCH", res.Verdict)
	}
	if res.Suggestion.Category != testCategory1S {
		t.Errorf("suggested category = %q, want 1S (different from current 3S)", res.Suggestion.Category)
	}
	// Both evidence photos (overview + close-up) must be attached as data URLs.
	if !res.UsedVision || seenImageParts != 2 {
		t.Errorf("used_vision=%v image parts=%d, want true/2", res.UsedVision, seenImageParts)
	}
	// SCRAP filtered (already selected), UNKNOWN not in catalog, OIL_LEAK kept.
	if len(res.Suggestion.Tags) != 1 || res.Suggestion.Tags[0] != "OIL_LEAK" {
		t.Errorf("suggested tags = %v, want [OIL_LEAK]", res.Suggestion.Tags)
	}
	if requestedModel == "" {
		t.Errorf("model not forwarded, got %q", requestedModel)
	}
}

func TestReview_DisabledAI(t *testing.T) {
	store := reviewTestFixture("http://unused", "")
	store.cfg.IsEnabled = false
	svc := NewService(store, nil, nil, "")
	svc.SetMinInterval(0)
	_, err := svc.Review(context.Background(), ReviewRequest{IssueID: 7, Lang: "vi"})
	if err == nil {
		t.Fatal("expected not-enabled error, got nil")
	}
	appErr, ok := err.(*apperror.AppError)
	if !ok || appErr.HTTPStatus != http.StatusBadRequest {
		t.Fatalf("expected 400 AppError, got %v", err)
	}
}

func TestReview_IssueNotFound(t *testing.T) {
	store := reviewTestFixture("http://unused", "")
	svc := NewService(store, nil, nil, "")
	svc.SetMinInterval(0)
	_, err := svc.Review(context.Background(), ReviewRequest{IssueID: 999, Lang: "vi"})
	appErr, ok := err.(*apperror.AppError)
	if !ok || appErr.HTTPStatus != http.StatusNotFound {
		t.Fatalf("expected 404 AppError, got %v", err)
	}
}

func TestReview_InvalidGatewayJSON(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": "not json at all"}},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	store := reviewTestFixture(mockServer.URL, "")
	svc := NewService(store, nil, mockServer.Client(), "")
	svc.SetMinInterval(0)
	_, err := svc.Review(context.Background(), ReviewRequest{IssueID: 7, Lang: "en"})
	appErr, ok := err.(*apperror.AppError)
	if !ok || appErr.HTTPStatus != http.StatusBadGateway {
		t.Fatalf("expected 502 AppError, got %v", err)
	}
}

func TestFollowUp_ValidatesQuestionAndReturnsAnswer(t *testing.T) {
	var receivedQuestion string
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		messages, _ := body["messages"].([]any)
		if len(messages) > 1 {
			content, _ := messages[1].(map[string]any)
			receivedQuestion, _ = content["content"].(string)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": "Cần chụp thêm góc rộng của khu vực."}}}})
	}))
	defer mockServer.Close()
	store := reviewTestFixture(mockServer.URL, "")
	svc := NewService(store, nil, mockServer.Client(), "")
	svc.SetMinInterval(0)
	if _, err := svc.FollowUp(context.Background(), FollowUpRequest{IssueID: 7, Question: strings.Repeat("x", reviewMaxQuestionRunes+1)}); err == nil {
		t.Fatal("expected oversized question error")
	}
	got, err := svc.FollowUp(context.Background(), FollowUpRequest{IssueID: 7, Lang: "vi", Question: "Cần chụp thêm ảnh gì?"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Answer == "" || receivedQuestion == "" {
		t.Fatalf("expected answer and forwarded question, got answer=%q question=%q", got.Answer, receivedQuestion)
	}
}

func TestFilterSuggestedQuestions(t *testing.T) {
	questions := []string{"", "Q1", "Q1", strings.Repeat("x", reviewMaxQuestionRunes+1), "Q2", "Q3", "Q4", "Q5", "Q6"}
	got := filterSuggestedQuestions(questions)
	if len(got) != reviewMaxSuggestedQuestions || strings.Join(got, ",") != "Q1,Q2,Q3,Q4,Q5" {
		t.Fatalf("unexpected filtered questions: %#v", got)
	}
}
