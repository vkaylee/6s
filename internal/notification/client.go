package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"6s/internal/crypto"
)

// Channel constants.
const (
	ChannelWxPusher   = "WXPUSHER"
	ChannelLANWebhook = "LAN_WEBHOOK"
)

// Sender abstracts HTTP dispatch for notifications.
type Sender interface {
	Send(ctx context.Context, channel, payloadStr string, cfg DecryptedConfig) error
}

// DecryptedConfig represents in-memory decrypted notification configurations.
type DecryptedConfig struct {
	WxPusherEnabled  bool
	WxPusherAppToken string
	LANWebhookURL    string
	PublicBaseURL    string
}

// HTTPSender implements real HTTP sending to WxPusher and LAN Webhooks.
type HTTPSender struct {
	client *http.Client
	cipher *crypto.Cipher
}

// NewHTTPSender creates an HTTPSender with a standard 10s timeout client.
func NewHTTPSender(cipher *crypto.Cipher) *HTTPSender {
	return &HTTPSender{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		cipher: cipher,
	}
}

// Send dispatches payload to the corresponding destination based on channel.
func (s *HTTPSender) Send(ctx context.Context, channel, payloadStr string, cfg DecryptedConfig) error {
	switch channel {
	case ChannelWxPusher:
		return s.sendWxPusher(ctx, payloadStr, cfg)
	case ChannelLANWebhook:
		return s.sendLANWebhook(ctx, payloadStr, cfg)
	default:
		return fmt.Errorf("unsupported notification channel: %s", channel)
	}
}

type wxPusherAPIRequest struct {
	AppToken    string   `json:"appToken"`
	Content     string   `json:"content"`
	ContentType int      `json:"contentType"`
	TopicIDs    []int64  `json:"topicIds,omitempty"`
	UIDs        []string `json:"uids,omitempty"`
	URL         string   `json:"url,omitempty"`
}

type wxPusherAPIResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

func (s *HTTPSender) sendWxPusher(ctx context.Context, payloadStr string, cfg DecryptedConfig) error {
	if !cfg.WxPusherEnabled || cfg.WxPusherAppToken == "" {
		return errors.New("wxpusher is disabled or missing appToken")
	}

	var raw map[string]any
	if err := json.Unmarshal([]byte(payloadStr), &raw); err != nil {
		return fmt.Errorf("unmarshal payload failed: %w", err)
	}

	issueID := raw["issue_id"]
	cat := raw["category"]
	loc := raw["location_code"]
	rep := raw["reporter_name"]

	detailURL := fmt.Sprintf("%s/issues/%v", cfg.PublicBaseURL, issueID)
	content := fmt.Sprintf("### ⚠️ CẢNH BÁO 6S: [%v]\n- **Vị trí**: %v\n- **Người báo**: %v\n- **Chi tiết**: [Xem tại đây](%s)", cat, loc, rep, detailURL)

	reqBody := wxPusherAPIRequest{
		AppToken:    cfg.WxPusherAppToken,
		Content:     content,
		ContentType: 3, // Markdown
		URL:         detailURL,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal wxpusher req failed: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://wxpusher.zjiecode.com/api/send/message", bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("create http request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("wxpusher request failed: %w", err)
	}
	defer func() {
		if cErr := resp.Body.Close(); cErr != nil {
			log.Printf("close resp body err: %v", cErr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("wxpusher returned non-200 status: %d", resp.StatusCode)
	}

	respBytes, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return fmt.Errorf("read wxpusher response failed: %w", readErr)
	}

	var apiResp wxPusherAPIResponse
	if err := json.Unmarshal(respBytes, &apiResp); err != nil {
		return fmt.Errorf("parse wxpusher response failed: %w", err)
	}

	if apiResp.Code != 1000 {
		return fmt.Errorf("wxpusher error: code %d, msg %s", apiResp.Code, apiResp.Msg)
	}

	return nil
}

type lanWebhookRequest struct {
	MsgType  string             `json:"msgtype"`
	Markdown lanWebhookMarkdown `json:"markdown"`
}

type lanWebhookMarkdown struct {
	Title string `json:"title"`
	Text  string `json:"text"`
}

func (s *HTTPSender) sendLANWebhook(ctx context.Context, payloadStr string, cfg DecryptedConfig) error {
	if cfg.LANWebhookURL == "" {
		return errors.New("missing lan webhook url")
	}

	var raw map[string]any
	if err := json.Unmarshal([]byte(payloadStr), &raw); err != nil {
		return fmt.Errorf("unmarshal payload failed: %w", err)
	}

	issueID := raw["issue_id"]
	cat := raw["category"]
	loc := raw["location_code"]
	detailURL := fmt.Sprintf("%s/issues/%v", cfg.PublicBaseURL, issueID)

	text := fmt.Sprintf("## ⚠️ Cảnh báo 6S: %v\n> Phân loại: %v\n> Link xử lý: %s", loc, cat, detailURL)
	reqBody := lanWebhookRequest{
		MsgType: "markdown",
		Markdown: lanWebhookMarkdown{
			Title: fmt.Sprintf("Cảnh báo 6S: %v", loc),
			Text:  text,
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal webhook body failed: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", cfg.LANWebhookURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("create webhook request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request failed: %w", err)
	}
	defer func() {
		if cErr := resp.Body.Close(); cErr != nil {
			log.Printf("close resp body err: %v", cErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("lan webhook returned status: %d", resp.StatusCode)
	}

	return nil
}
