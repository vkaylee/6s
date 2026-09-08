package notification

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"time"

	"6s/internal/crypto"
	"6s/internal/db"
	"6s/internal/observability"
)

// Store defines database operations required by the Outbox Worker.
type Store interface {
	ClaimOutboxTasks(ctx context.Context, limit int32) ([]db.NotificationOutbox, error)
	MarkOutboxSent(ctx context.Context, id int64) error
	MarkOutboxFailed(ctx context.Context, arg db.MarkOutboxFailedParams) error
	RetryOutboxTask(ctx context.Context, arg db.RetryOutboxTaskParams) error
	CreateOutboxEntry(ctx context.Context, arg db.CreateOutboxEntryParams) (db.NotificationOutbox, error)
	GetNotificationConfig(ctx context.Context) (db.NotificationConfig, error)
}

// Worker processes notification outbox rows reliably.
type Worker struct {
	store    Store
	sender   Sender
	cipher   *crypto.Cipher
	notifyCh <-chan struct{}
}

// NewWorker creates an outbox Worker instance.
func NewWorker(store Store, sender Sender, cipher *crypto.Cipher, notifyCh <-chan struct{}) *Worker {
	return &Worker{
		store:    store,
		sender:   sender,
		cipher:   cipher,
		notifyCh: notifyCh,
	}
}

// Start launches the background worker loop until ctx is canceled.
func (w *Worker) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Initial sweep on start
	w.ProcessBatch(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.notifyCh:
			w.ProcessBatch(ctx)
		case <-ticker.C:
			w.ProcessBatch(ctx)
		}
	}
}

// ProcessBatch claims pending/expired-lease tasks and processes them sequentially.
func (w *Worker) ProcessBatch(ctx context.Context) {
	cfg, err := w.loadDecryptedConfig(ctx)
	if err != nil {
		observability.Log("error", "notification config load failed", map[string]any{"error": err.Error()})
		return
	}

	for {
		tasks, claimErr := w.store.ClaimOutboxTasks(ctx, 20)
		if claimErr != nil {
			if !errors.Is(claimErr, sql.ErrNoRows) {
				observability.Log("error", "notification task claim failed", map[string]any{"error": claimErr.Error()})
			}
			return
		}
		if len(tasks) == 0 {
			return
		}

		for _, task := range tasks {
			w.processTask(ctx, task, cfg)
		}
	}
}

func (w *Worker) processTask(ctx context.Context, task db.NotificationOutbox, cfg DecryptedConfig) {
	sendErr := w.sender.Send(ctx, task.Channel, string(task.Payload), cfg)
	if sendErr == nil {
		if err := w.store.MarkOutboxSent(ctx, task.ID); err != nil {
			observability.Log("error", "notification task completion failed", map[string]any{"error": err.Error()})
		}
		return
	}

	observability.Log("error", "notification delivery failed", map[string]any{"task_id": task.ID, "channel": task.Channel, "error": sendErr.Error()})
	if task.RetryCount+1 >= task.MaxRetries {
		if err := w.store.MarkOutboxFailed(ctx, db.MarkOutboxFailedParams{
			ID:        task.ID,
			LastError: sql.NullString{String: "notification delivery failed", Valid: true},
		}); err != nil {
			observability.Log("error", "notification task failure update failed", map[string]any{"error": err.Error()})
		}

		// Fallback to LAN Webhook if WxPusher fails completely (SPEC.md Section 8.1)
		if task.Channel == ChannelWxPusher {
			if _, err := w.store.CreateOutboxEntry(ctx, db.CreateOutboxEntryParams{
				IssueID:   task.IssueID,
				EventType: task.EventType,
				Channel:   ChannelLANWebhook,
				Payload:   task.Payload,
			}); err != nil {
				observability.Log("error", "notification fallback creation failed", map[string]any{"error": err.Error()})
			}
		}
	} else {
		// Exponential backoff: math.Pow(3, retryCount+1) * 5 seconds
		backoffSec := int32(math.Pow(3, float64(task.RetryCount+1)) * 5) //nolint:gosec
		if err := w.store.RetryOutboxTask(ctx, db.RetryOutboxTaskParams{
			ID:        task.ID,
			LastError: sql.NullString{String: "notification delivery failed", Valid: true},
			Column2:   backoffSec,
		}); err != nil {
			observability.Log("error", "notification retry update failed", map[string]any{"error": err.Error()})
		}
	}
}
func (w *Worker) loadDecryptedConfig(ctx context.Context) (DecryptedConfig, error) {
	cfgRow, err := w.store.GetNotificationConfig(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return DecryptedConfig{
				WxPusherEnabled: true,
				PublicBaseURL:   "https://6s.factory.lan",
			}, nil
		}
		return DecryptedConfig{}, err
	}

	appToken := cfgRow.WxpusherAppToken
	if appToken != "" && w.cipher != nil {
		if dec, decErr := w.cipher.Decrypt(appToken); decErr == nil {
			appToken = dec
		}
	}

	webhookURL := cfgRow.LanWebhookUrl
	if webhookURL != "" && w.cipher != nil {
		if dec, decErr := w.cipher.Decrypt(webhookURL); decErr == nil {
			webhookURL = dec
		}
	}

	return DecryptedConfig{
		WxPusherEnabled:  cfgRow.WxpusherEnabled,
		WxPusherAppToken: appToken,
		LANWebhookURL:    webhookURL,
		PublicBaseURL:    cfgRow.PublicBaseUrl,
	}, nil
}
