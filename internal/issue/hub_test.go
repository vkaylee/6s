package issue

import (
	"sync"
	"testing"
	"time"
)

func TestHub_SubscribeAndBroadcast(t *testing.T) {
	hub := NewHub()
	ch1, unsub1 := hub.Subscribe()
	defer unsub1()

	ch2, unsub2 := hub.Subscribe()
	defer unsub2()

	evt := Event{Type: EventIssueCreated, IssueID: 42}
	hub.Broadcast(evt)

	select {
	case received := <-ch1:
		if received != evt {
			t.Fatalf("ch1: expected %+v, got %+v", evt, received)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("ch1 timed out waiting for event")
	}

	select {
	case received := <-ch2:
		if received != evt {
			t.Fatalf("ch2: expected %+v, got %+v", evt, received)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("ch2 timed out waiting for event")
	}
}

func TestHub_Unsubscribe(t *testing.T) {
	hub := NewHub()
	ch, unsub := hub.Subscribe()

	hub.mu.RLock()
	countBefore := len(hub.subscribers)
	hub.mu.RUnlock()
	if countBefore != 1 {
		t.Fatalf("expected 1 subscriber, got %d", countBefore)
	}

	unsub()

	hub.mu.RLock()
	countAfter := len(hub.subscribers)
	hub.mu.RUnlock()
	if countAfter != 0 {
		t.Fatalf("expected 0 subscribers after unsubscribe, got %d", countAfter)
	}

	// Broadcast should not deliver to unsubscribed channel
	hub.Broadcast(Event{Type: EventIssueUpdated, IssueID: 99})

	select {
	case evt := <-ch:
		t.Fatalf("unexpected event received on unsubscribed channel: %+v", evt)
	case <-time.After(50 * time.Millisecond):
		// Expected timeout
	}
}

func TestHub_SlowConsumerNonBlocking(t *testing.T) {
	hub := NewHub()
	slowCh, unsubSlow := hub.Subscribe()
	defer unsubSlow()

	fastCh, unsubFast := hub.Subscribe()
	defer unsubFast()

	// A subscriber buffer is bounded; this test verifies non-blocking broadcast.
	totalEvents := 16
	for i := 1; i <= totalEvents; i++ {
		hub.Broadcast(Event{Type: EventIssueUpdated, IssueID: int64(i)})
	}

	var fastReceived int
	for i := 0; i < totalEvents; i++ {
		select {
		case <-fastCh:
			fastReceived++
		case <-time.After(500 * time.Millisecond):
			t.Fatalf("fast consumer timed out at event %d", i)
		}
	}
	if fastReceived != totalEvents {
		t.Fatalf("fast consumer: expected %d events, got %d", totalEvents, fastReceived)
	}

	// Slow consumer buffer had 16 slots, so at most 16 should be readable
	var slowReceived int
drainLoop:
	for {
		select {
		case <-slowCh:
			slowReceived++
		default:
			break drainLoop
		}
	}
	if slowReceived > 16 {
		t.Fatalf("slow consumer received %d events, buffer should cap at 16", slowReceived)
	}
}

func TestHub_ConcurrentBroadcastAndUnsubscribe(_ *testing.T) {
	hub := NewHub()
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ch, unsub := hub.Subscribe()
			time.Sleep(5 * time.Millisecond)
			unsub()
			select {
			case <-ch:
			default:
			}
		}()
	}

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(id int64) {
			defer wg.Done()
			hub.Broadcast(Event{Type: EventIssueCreated, IssueID: id})
		}(int64(i))
	}

	wg.Wait()
}
