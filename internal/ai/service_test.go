package ai

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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

func TestParseChatResponse_EdgeCases(t *testing.T) {
	// 1. Trailing "data: [DONE]" from gateway
	trailingData := []byte(`{"choices":[{"message":{"content":"Sàn nhà có dầu."}}]}data: [DONE]`)
	res1, err := parseChatResponse(trailingData)
	if err != nil {
		t.Fatalf("unexpected error on trailing data: %v", err)
	}
	if res1 != "Sàn nhà có dầu." {
		t.Errorf("expected 'Sàn nhà có dầu.', got %q", res1)
	}

	// 2. SSE stream chunks
	sseData := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"Chuyền may \"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"A1\"}}]}\n\ndata: [DONE]\n")
	res2, err := parseChatResponse(sseData)
	if err != nil {
		t.Fatalf("unexpected error on SSE data: %v", err)
	}
	if res2 != "Chuyền may A1" {
		t.Errorf("expected 'Chuyền may A1', got %q", res2)
	}

	// 3. Fallback to reasoning_content
	reasoningData := []byte(`{"choices":[{"message":{"content":"","reasoning_content":"Translated: Line A1"}}]}`)
	res3, err := parseChatResponse(reasoningData)
	if err != nil {
		t.Fatalf("unexpected error on reasoning fallback: %v", err)
	}
	if res3 != "Translated: Line A1" {
		t.Errorf("expected 'Translated: Line A1', got %q", res3)
	}
}
