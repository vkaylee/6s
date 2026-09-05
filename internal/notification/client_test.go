package notification

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPSender_Send(t *testing.T) {
	// 1. Mock WxPusher Server
	wxServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"code":1000,"msg":"success"}`))
	}))
	defer wxServer.Close()

	// 2. Mock LAN Webhook Server
	lanServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer lanServer.Close()

	sender := NewHTTPSender(nil)

	// Test LAN Webhook
	cfgLAN := DecryptedConfig{
		LANWebhookURL: lanServer.URL,
		PublicBaseURL: "http://localhost:8080",
	}
	payload := `{"issue_id":1,"category":"1S","location_code":"LINE_A1"}`
	err := sender.Send(context.Background(), ChannelLANWebhook, payload, cfgLAN)
	if err != nil {
		t.Fatalf("send LAN webhook failed: %v", err)
	}

	// Test unsupported channel
	err = sender.Send(context.Background(), "UNKNOWN_CHANNEL", payload, cfgLAN)
	if err == nil {
		t.Fatal("expected error for unsupported channel")
	}

	// Test missing LAN webhook URL
	err = sender.Send(context.Background(), ChannelLANWebhook, payload, DecryptedConfig{})
	if err == nil {
		t.Fatal("expected error for missing webhook url")
	}
}
