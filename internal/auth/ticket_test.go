package auth

import (
	"testing"
	"time"
)

func TestTicketManager_Lifecycle(t *testing.T) {
	tm := NewTicketManager()

	// 1. Issue ticket
	ticket, err := tm.Issue(42)
	if err != nil {
		t.Fatalf("unexpected issue err: %v", err)
	}
	if len(ticket) == 0 {
		t.Fatal("expected non-empty ticket")
	}

	// 2. Consume ticket successfully
	userID, err := tm.Consume(ticket)
	if err != nil {
		t.Fatalf("unexpected consume err: %v", err)
	}
	if userID != 42 {
		t.Errorf("expected userID 42, got %d", userID)
	}

	// 3. Re-consume must fail (single-use)
	_, err = tm.Consume(ticket)
	if err != ErrInvalidTicket {
		t.Errorf("expected ErrInvalidTicket on reuse, got %v", err)
	}

	// 4. Invalid ticket
	_, err = tm.Consume("nonexistent")
	if err != ErrInvalidTicket {
		t.Errorf("expected ErrInvalidTicket for invalid ticket, got %v", err)
	}

	// 5. Expired ticket
	tm.tickets["expired"] = ticketItem{
		userID:    99,
		expiresAt: time.Now().Add(-1 * time.Second),
	}
	_, err = tm.Consume("expired")
	if err != ErrInvalidTicket {
		t.Errorf("expected ErrInvalidTicket for expired ticket, got %v", err)
	}
}
