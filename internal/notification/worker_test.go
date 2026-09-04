package notification

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"6s/internal/db"
)

type mockNotificationStore struct {
	tasks   []db.NotificationOutbox
	sentIDs []int64
	failIDs []int64
	retried []db.RetryOutboxTaskParams
	created []db.CreateOutboxEntryParams
	cfg     db.NotificationConfig
}

func (m *mockNotificationStore) ClaimOutboxTasks(_ context.Context, _ int32) ([]db.NotificationOutbox, error) {
	res := m.tasks
	m.tasks = nil
	return res, nil
}

func (m *mockNotificationStore) MarkOutboxSent(_ context.Context, id int64) error {
	m.sentIDs = append(m.sentIDs, id)
	return nil
}

func (m *mockNotificationStore) MarkOutboxFailed(_ context.Context, arg db.MarkOutboxFailedParams) error {
	m.failIDs = append(m.failIDs, arg.ID)
	return nil
}

func (m *mockNotificationStore) RetryOutboxTask(_ context.Context, arg db.RetryOutboxTaskParams) error {
	m.retried = append(m.retried, arg)
	return nil
}

func (m *mockNotificationStore) CreateOutboxEntry(_ context.Context, arg db.CreateOutboxEntryParams) (db.NotificationOutbox, error) {
	m.created = append(m.created, arg)
	return db.NotificationOutbox{ID: 99, Channel: arg.Channel}, nil
}

func (m *mockNotificationStore) GetNotificationConfig(_ context.Context) (db.NotificationConfig, error) {
	return m.cfg, nil
}

type mockSender struct {
	failChannel string
}

func (m *mockSender) Send(_ context.Context, channel, _ string, _ DecryptedConfig) error {
	if m.failChannel == channel || m.failChannel == "ALL" {
		return errors.New("network failure")
	}
	return nil
}

func TestOutboxWorker_HappyPath(t *testing.T) {
	store := &mockNotificationStore{
		tasks: []db.NotificationOutbox{
			{
				ID:         1,
				IssueID:    10,
				EventType:  "NEW_ISSUE",
				Channel:    ChannelWxPusher,
				Payload:    json.RawMessage(`{"issue_id":10,"category":"3S"}`),
				MaxRetries: 5,
			},
		},
		cfg: db.NotificationConfig{
			WxpusherEnabled:  true,
			WxpusherAppToken: "plain-token",
			PublicBaseUrl:    "https://6s.factory.lan",
		},
	}
	sender := &mockSender{}
	worker := NewWorker(store, sender, nil, nil)

	worker.ProcessBatch(context.Background())

	if len(store.sentIDs) != 1 || store.sentIDs[0] != 1 {
		t.Errorf("expected task 1 marked as sent, got %v", store.sentIDs)
	}
}

func TestOutboxWorker_RetryAndFallback(t *testing.T) {
	store := &mockNotificationStore{
		tasks: []db.NotificationOutbox{
			{
				ID:         2,
				IssueID:    20,
				EventType:  "NEW_ISSUE",
				Channel:    ChannelWxPusher,
				Payload:    json.RawMessage(`{"issue_id":20,"category":"6S"}`),
				RetryCount: 4,
				MaxRetries: 5, // Next failure will exhaust retries (4 + 1 >= 5)
			},
		},
		cfg: db.NotificationConfig{
			WxpusherEnabled:  true,
			WxpusherAppToken: "token",
			LanWebhookUrl:    "https://hook.lan",
			PublicBaseUrl:    "https://6s.factory.lan",
		},
	}
	sender := &mockSender{failChannel: ChannelWxPusher}
	worker := NewWorker(store, sender, nil, nil)

	worker.ProcessBatch(context.Background())

	if len(store.failIDs) != 1 || store.failIDs[0] != 2 {
		t.Errorf("expected task 2 marked as failed, got %v", store.failIDs)
	}

	// Verify fallback created for LAN_WEBHOOK
	if len(store.created) != 1 || store.created[0].Channel != ChannelLANWebhook {
		t.Errorf("expected LAN_WEBHOOK fallback created, got %+v", store.created)
	}
}
