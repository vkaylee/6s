package issue

import "sync"

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

	// recipients is the subscriber audience resolved once per broadcast. It is unexported so
	// it never reaches the wire; nil means the audience was not resolved and the delivery
	// point must re-check visibility through the issue detail projection.
	recipients *eventRecipients
}

// eventRecipients indexes the subscriber IDs allowed to receive one event.
type eventRecipients struct {
	ids map[int64]struct{}
}

// newEventRecipients indexes allowed subscriber IDs for membership checks.
func newEventRecipients(ids []int64) *eventRecipients {
	set := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		set[id] = struct{}{}
	}
	return &eventRecipients{ids: set}
}

// withRecipients binds the resolved audience to the event before publication.
func (e Event) withRecipients(ids []int64) Event {
	e.recipients = newEventRecipients(ids)
	return e
}

// canDeliver reports whether userID may receive the event. resolved is false when the
// audience was never computed, leaving the caller to re-check visibility authoritatively.
func (e Event) canDeliver(userID int64) (allowed bool, resolved bool) {
	if e.recipients == nil {
		return false, false
	}
	_, allowed = e.recipients.ids[userID]
	return allowed, true
}

// Hub manages active SSE subscriber channels and the user watching each one.
type Hub struct {
	mu          sync.RWMutex
	subscribers map[chan Event]int64
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	return &Hub{subscribers: make(map[chan Event]int64)}
}

// Subscribe registers a channel for an authenticated user and returns an unsubscribe func.
// An omitted user ID keeps direct hub tests compatible; production passes the user ID.
func (h *Hub) Subscribe(userID ...int64) (<-chan Event, func()) {
	var uid int64
	if len(userID) > 0 {
		uid = userID[0]
	}
	ch := make(chan Event, 16)
	h.mu.Lock()
	h.subscribers[ch] = uid
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

// SubscriberIDs returns the distinct authenticated user IDs currently subscribed.
func (h *Hub) SubscriberIDs() []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()

	ids := make([]int64, 0, len(h.subscribers))
	seen := make(map[int64]struct{}, len(h.subscribers))
	for _, id := range h.subscribers {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids
}

// Broadcast sends evt to every subscriber non-blockingly. A resolved audience restricts
// delivery to the named users; an unresolved event reaches every subscriber.
func (h *Hub) Broadcast(evt Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch, userID := range h.subscribers {
		if evt.recipients != nil {
			if _, ok := evt.recipients.ids[userID]; !ok {
				continue
			}
		}
		select {
		case ch <- evt:
		default:
			// Dropped if slow consumer buffer full to avoid blocking server
		}
	}
}
