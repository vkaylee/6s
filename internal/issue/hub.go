package issue

import (
	"sync"
)

// EventType represents the type of issue change event.
type EventType string

// Predefined SSE event types.
const (
	EventIssueCreated     EventType = "ISSUE_CREATED"
	EventIssueUpdated     EventType = "ISSUE_UPDATED"
	EventIssueResolved    EventType = "ISSUE_RESOLVED"
	EventIssueClosed      EventType = "ISSUE_CLOSED"
	EventIssueReopened    EventType = "ISSUE_REOPENED"
	EventIssueInvalidated EventType = "ISSUE_INVALIDATED"
)

// Event is dispatched over SSE when an issue mutates.
type Event struct {
	Type    EventType `json:"type"`
	IssueID int64     `json:"issue_id"`
}

// Hub manages active SSE subscriber channels.
type Hub struct {
	mu          sync.RWMutex
	subscribers map[chan Event]struct{}
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	return &Hub{
		subscribers: make(map[chan Event]struct{}),
	}
}

// Subscribe adds a channel to the subscriber set and returns an unsubscribe func.
func (h *Hub) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 16)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()

	unsubscribe := func() {
		h.mu.Lock()
		delete(h.subscribers, ch)
		h.mu.Unlock()
		// Drain remaining buffered events safely
		select {
		case <-ch:
		default:
		}
	}

	return ch, unsubscribe
}

// Broadcast sends an event to all connected subscribers non-blockingly.
func (h *Hub) Broadcast(evt Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch := range h.subscribers {
		select {
		case ch <- evt:
		default:
			// Dropped if slow consumer buffer full to avoid blocking server
		}
	}
}
