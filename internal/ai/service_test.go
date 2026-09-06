package ai

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/openai/openai-go"

	"6s/internal/crypto"
	"6s/internal/db"
)

type mockStore struct {
	cfg       db.AiConfig
	cfgErr    error
	upsertErr error
	auditLogs []db.InsertAuditLogParams
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

	svc := NewService(store, nil, mockServer.Client())

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

	svc := NewService(store, nil, mockServer.Client())

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

	svc := NewService(store, nil, nil)
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

	svc := NewService(store, nil, nil)
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

	svc := NewService(store, cph, nil)

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

	svc := NewService(store, nil, mockServer.Client())

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

func TestService_TestDNS(t *testing.T) {
	cipher, _ := crypto.NewCipher("MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=")
	store := &mockStore{
		cfg: db.AiConfig{
			BaseUrl: "http://localhost:8080/v1",
		},
	}
	svc := NewService(store, cipher, nil)

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
	svc := NewService(&mockStore{}, nil, nil)
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
