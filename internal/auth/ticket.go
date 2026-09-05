package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// ErrInvalidTicket indicates expired, consumed, or non-existent ticket.
var ErrInvalidTicket = errors.New("invalid or expired ticket")

const (
	// TicketTTL defines lifetime of a one-time streaming connection ticket (30s).
	TicketTTL = 30 * time.Second
	// TicketBytes defines entropy size (24 bytes -> 48 hex chars).
	TicketBytes = 24
)

type ticketItem struct {
	userID    int64
	expiresAt time.Time
}

// TicketManager issues and consumes single-use short-lived tickets for SSE / WebSocket.
type TicketManager struct {
	mu      sync.Mutex
	tickets map[string]ticketItem
}

// NewTicketManager creates a TicketManager with in-memory store.
func NewTicketManager() *TicketManager {
	return &TicketManager{
		tickets: make(map[string]ticketItem),
	}
}

// Issue generates a single-use ticket bound to a userID.
func (tm *TicketManager) Issue(userID int64) (string, error) {
	b := make([]byte, TicketBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	ticket := hex.EncodeToString(b)

	now := time.Now()
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// Opportunistic cleanup of expired tickets
	for k, item := range tm.tickets {
		if now.After(item.expiresAt) {
			delete(tm.tickets, k)
		}
	}

	tm.tickets[ticket] = ticketItem{
		userID:    userID,
		expiresAt: now.Add(TicketTTL),
	}

	return ticket, nil
}

// Consume validates and immediately invalidates a single-use ticket.
// Returns the associated userID or ErrInvalidTicket.
func (tm *TicketManager) Consume(ticket string) (int64, error) {
	if ticket == "" {
		return 0, ErrInvalidTicket
	}

	tm.mu.Lock()
	defer tm.mu.Unlock()

	item, exists := tm.tickets[ticket]
	if !exists {
		return 0, ErrInvalidTicket
	}

	// Always delete upon attempt (single-use)
	delete(tm.tickets, ticket)

	if time.Now().After(item.expiresAt) {
		return 0, ErrInvalidTicket
	}

	return item.userID, nil
}
