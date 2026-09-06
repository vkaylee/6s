package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"6s/internal/auth"
	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/response"
)

func TestAIHandler(t *testing.T) {
	cipher, _ := crypto.NewCipher("MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=")
	store := &mockStore{
		cfg: db.AiConfig{
			ID:             1,
			IsEnabled:      true,
			BaseUrl:        "https://ai.lan/v1",
			ApiKey:         "token",
			DefaultModel:   "gpt-4o-mini",
			ModelTranslate: "",
			UpdatedAt:      time.Now(),
		},
	}

	mockGateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "Bụi bẩn bám đầy sàn",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockGateway.Close()

	// Update store baseUrl to mockGateway
	store.cfg.BaseUrl = mockGateway.URL

	svc := NewService(store, cipher, mockGateway.Client())
	handler := NewHandler(svc)
	adminUser := db.User{ID: 1, Role: "ADMIN"}

	// 1. GET /api/config/ai
	reqGet := httptest.NewRequest(http.MethodGet, "/api/config/ai", nil)
	rrGet := httptest.NewRecorder()
	handler.GetConfig(rrGet, reqGet)
	if rrGet.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rrGet.Code)
	}

	var envGet response.Envelope
	_ = json.Unmarshal(rrGet.Body.Bytes(), &envGet)
	dataBytes, _ := json.Marshal(envGet.Data)
	var cfgResp ConfigResponse
	_ = json.Unmarshal(dataBytes, &cfgResp)
	if !cfgResp.IsEnabled || !cfgResp.HasAPIKey {
		t.Errorf("expected IsEnabled=true, HasAPIKey=true, got %+v", cfgResp)
	}

	// 2. PUT /api/config/ai
	enabled := true
	putBody, _ := json.Marshal(UpdateConfigRequest{
		IsEnabled:    &enabled,
		BaseURL:      mockGateway.URL,
		APIKey:       "new-api-key",
		DefaultModel: "gpt-4o",
	})
	reqPut := httptest.NewRequest(http.MethodPut, "/api/config/ai", bytes.NewReader(putBody))
	ctxUser := context.WithValue(reqPut.Context(), auth.UserContextKey, adminUser)
	rrPut := httptest.NewRecorder()
	handler.UpdateConfig(rrPut, reqPut.WithContext(ctxUser))
	if rrPut.Code != http.StatusOK {
		t.Fatalf("expected 200 on put, got %d", rrPut.Code)
	}

	// 3. POST /api/ai/translate (Valid)
	transBody, _ := json.Marshal(TranslateRequest{
		Text:       "Ground is dirty",
		TargetLang: "vi",
	})
	reqTrans := httptest.NewRequest(http.MethodPost, "/api/ai/translate", bytes.NewReader(transBody))
	rrTrans := httptest.NewRecorder()
	handler.Translate(rrTrans, reqTrans)
	if rrTrans.Code != http.StatusOK {
		t.Fatalf("expected 200 on translate, got %d: %s", rrTrans.Code, rrTrans.Body.String())
	}

	var envTrans response.Envelope
	_ = json.Unmarshal(rrTrans.Body.Bytes(), &envTrans)
	transDataBytes, _ := json.Marshal(envTrans.Data)
	var transResp TranslateResponse
	_ = json.Unmarshal(transDataBytes, &transResp)
	if transResp.TranslatedText != "Bụi bẩn bám đầy sàn" {
		t.Errorf("expected 'Bụi bẩn bám đầy sàn', got %q", transResp.TranslatedText)
	}

	// 4. POST /api/ai/translate (Empty text -> 400)
	transBodyEmpty, _ := json.Marshal(TranslateRequest{
		Text:       "",
		TargetLang: "vi",
	})
	reqTransEmpty := httptest.NewRequest(http.MethodPost, "/api/ai/translate", bytes.NewReader(transBodyEmpty))
	rrTransEmpty := httptest.NewRecorder()
	handler.Translate(rrTransEmpty, reqTransEmpty)
	if rrTransEmpty.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty text, got %d", rrTransEmpty.Code)
	}

	// 5. POST /api/ai/translate (Disabled AI -> 400)
	store.cfg.IsEnabled = false
	reqTransDisabled := httptest.NewRequest(http.MethodPost, "/api/ai/translate", bytes.NewReader(transBody))
	rrTransDisabled := httptest.NewRecorder()
	handler.Translate(rrTransDisabled, reqTransDisabled)
	if rrTransDisabled.Code != http.StatusBadRequest {
		t.Errorf("expected 400 when AI is disabled, got %d", rrTransDisabled.Code)
	}

	// 6. POST /api/config/ai/test
	store.cfg.IsEnabled = true
	testBody, _ := json.Marshal(TestRequest{
		Model: "gpt-4o-mini",
	})
	reqTest := httptest.NewRequest(http.MethodPost, "/api/config/ai/test", bytes.NewReader(testBody))
	rrTest := httptest.NewRecorder()
	handler.TestConnection(rrTest, reqTest)
	if rrTest.Code != http.StatusOK {
		t.Fatalf("expected 200 on test connection, got %d", rrTest.Code)
	}

	// 7. POST /api/config/ai/test-dns
	dnsBody, _ := json.Marshal(DNSTestRequest{
		BaseURL: "http://localhost:8080/v1",
	})
	reqDNS := httptest.NewRequest(http.MethodPost, "/api/config/ai/test-dns", bytes.NewReader(dnsBody))
	rrDNS := httptest.NewRecorder()
	handler.TestDNS(rrDNS, reqDNS)
	if rrDNS.Code != http.StatusOK {
		t.Fatalf("expected 200 on test dns, got %d", rrDNS.Code)
	}
}
