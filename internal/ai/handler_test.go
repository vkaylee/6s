package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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

	svc := NewService(store, cipher, mockGateway.Client(), "")
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

	// 8. PUT /api/config/ai without user context -> 401
	reqNoAuth := httptest.NewRequest(http.MethodPut, "/api/config/ai", bytes.NewReader(putBody))
	rrNoAuth := httptest.NewRecorder()
	handler.UpdateConfig(rrNoAuth, reqNoAuth)
	if rrNoAuth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without auth, got %d", rrNoAuth.Code)
	}

	// 9. PUT /api/config/ai with invalid JSON -> 400
	reqBadJSON := httptest.NewRequest(http.MethodPut, "/api/config/ai", bytes.NewReader([]byte("{invalid-json")))
	rrBadJSON := httptest.NewRecorder()
	handler.UpdateConfig(rrBadJSON, reqBadJSON.WithContext(ctxUser))
	if rrBadJSON.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", rrBadJSON.Code)
	}

	// 10. POST /api/ai/translate text exceeds 10,000 chars -> 400
	hugeText := strings.Repeat("a", 10001)
	hugeBody, _ := json.Marshal(TranslateRequest{Text: hugeText, TargetLang: "vi"})
	reqHuge := httptest.NewRequest(http.MethodPost, "/api/ai/translate", bytes.NewReader(hugeBody))
	rrHuge := httptest.NewRecorder()
	handler.Translate(rrHuge, reqHuge)
	if rrHuge.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for text > 10,000 chars, got %d", rrHuge.Code)
	}

	// 11. POST /api/config/ai/test bad JSON -> 400
	reqBadTest := httptest.NewRequest(http.MethodPost, "/api/config/ai/test", bytes.NewReader([]byte("{bad")))
	rrBadTest := httptest.NewRecorder()
	handler.TestConnection(rrBadTest, reqBadTest)
	if rrBadTest.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad test JSON, got %d", rrBadTest.Code)
	}

	// 12. POST /api/config/ai/test-dns bad JSON -> 400
	reqBadDNS := httptest.NewRequest(http.MethodPost, "/api/config/ai/test-dns", bytes.NewReader([]byte("{bad")))
	rrBadDNS := httptest.NewRecorder()
	handler.TestDNS(rrBadDNS, reqBadDNS)
	if rrBadDNS.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad dns JSON, got %d", rrBadDNS.Code)
	}
}

func TestAIHandler_TranslateRateLimitQueue(t *testing.T) {
	mockGateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]string{
						"content": "Bụi bẩn",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockGateway.Close()

	store := &mockStore{
		cfg: db.AiConfig{
			ID:           1,
			IsEnabled:    true,
			BaseUrl:      mockGateway.URL,
			ApiKey:       "token",
			DefaultModel: "gpt-4o-mini",
		},
	}

	svc := NewService(store, nil, mockGateway.Client(), "")
	interval := 80 * time.Millisecond
	svc.SetMinInterval(interval)
	handler := NewHandler(svc)

	const n = 2
	var wg sync.WaitGroup
	recorders := make([]*httptest.ResponseRecorder, n)
	start := time.Now()

	for i := range n {
		recorders[i] = httptest.NewRecorder()
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			body, _ := json.Marshal(TranslateRequest{Text: "Test text", TargetLang: "vi"})
			req := httptest.NewRequest(http.MethodPost, "/api/ai/translate", bytes.NewReader(body))
			handler.Translate(recorders[idx], req)
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(start)

	for i := range n {
		if recorders[i].Code != http.StatusOK {
			t.Fatalf("request %d failed with code %d: %s", i, recorders[i].Code, recorders[i].Body.String())
		}
	}

	if elapsed < interval-15*time.Millisecond {
		t.Errorf("total elapsed time was %v, expected at least %v", elapsed, interval)
	}
}

func TestAIHandler_GetCached(t *testing.T) {
	sourceText := "Sàn nhà ướt"
	cachedText := "Wet floor"
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
	handler := NewHandler(svc)

	// 1. Cache hit -> { "cached": true, "translated_text": "Wet floor" }
	hitBody, _ := json.Marshal(CachedTranslationRequest{Text: sourceText, TargetLang: "en"})
	reqHit := httptest.NewRequest(http.MethodPost, "/api/ai/cached", bytes.NewReader(hitBody))
	rrHit := httptest.NewRecorder()
	handler.GetCached(rrHit, reqHit)
	if rrHit.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rrHit.Code)
	}
	var envHit response.Envelope
	_ = json.Unmarshal(rrHit.Body.Bytes(), &envHit)
	dataBytes, _ := json.Marshal(envHit.Data)
	var resHit CachedTranslationResponse
	_ = json.Unmarshal(dataBytes, &resHit)
	if !resHit.Cached || resHit.TranslatedText != cachedText {
		t.Errorf("expected cached=true, text=%q, got %+v", cachedText, resHit)
	}

	// 2. Cache miss -> { "cached": false }
	missBody, _ := json.Marshal(CachedTranslationRequest{Text: "Khác", TargetLang: "en"})
	reqMiss := httptest.NewRequest(http.MethodPost, "/api/ai/cached", bytes.NewReader(missBody))
	rrMiss := httptest.NewRecorder()
	handler.GetCached(rrMiss, reqMiss)
	if rrMiss.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rrMiss.Code)
	}
	var envMiss response.Envelope
	_ = json.Unmarshal(rrMiss.Body.Bytes(), &envMiss)
	dataMissBytes, _ := json.Marshal(envMiss.Data)
	var resMiss CachedTranslationResponse
	_ = json.Unmarshal(dataMissBytes, &resMiss)
	if resMiss.Cached || resMiss.TranslatedText != "" {
		t.Errorf("expected cached=false, got %+v", resMiss)
	}

	// 3. Bad JSON -> 400
	reqBad := httptest.NewRequest(http.MethodPost, "/api/ai/cached", bytes.NewReader([]byte("{bad")))
	rrBad := httptest.NewRecorder()
	handler.GetCached(rrBad, reqBad)
	if rrBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rrBad.Code)
	}
}
