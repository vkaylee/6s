package auth

import (
	"net/http/httptest"
	"testing"
)

func TestLoginLimiter_IPRateLimit(t *testing.T) {
	limiter := NewLoginLimiter([]string{"127.0.0.1"})

	ip := "192.168.1.50"
	account := "user1"

	// 4 failures should still be allowed
	for i := 0; i < 4; i++ {
		limiter.RecordFailure(ip, account)
		okIP, _, _ := limiter.CheckAllowed(ip, account)
		if !okIP {
			t.Fatalf("iteration %d: expected IP to be allowed", i)
		}
	}

	// 5th failure triggers limit
	limiter.RecordFailure(ip, account)
	okIP, _, retryAfter := limiter.CheckAllowed(ip, account)
	if okIP {
		t.Fatal("expected IP to be rate limited on 5th failure")
	}
	if retryAfter <= 0 {
		t.Errorf("expected positive retryAfter, got %d", retryAfter)
	}
}

func TestLoginLimiter_AccountLockout(t *testing.T) {
	limiter := NewLoginLimiter(nil)

	ip := "192.168.1.100"
	account := "locked_worker"

	for i := 1; i <= 9; i++ {
		locked := limiter.RecordFailure(ip, account)
		if locked {
			t.Fatalf("account locked prematurely at attempt %d", i)
		}
		_, okAcc, _ := limiter.CheckAllowed(ip, account)
		if !okAcc {
			t.Fatalf("attempt %d: account should not be locked yet", i)
		}
	}

	// 10th failure locks account
	locked := limiter.RecordFailure(ip, account)
	if !locked {
		t.Fatal("expected 10th failure to report account locked")
	}

	_, okAcc, retryAfter := limiter.CheckAllowed(ip, account)
	if okAcc {
		t.Fatal("expected account to be locked")
	}
	if retryAfter <= 0 {
		t.Errorf("expected positive retryAfter for lockout, got %d", retryAfter)
	}

	// Record success resets lock
	limiter.RecordSuccess(account)
	_, okAccAfterReset, _ := limiter.CheckAllowed(ip, account)
	if !okAccAfterReset {
		t.Fatal("expected account to be unlocked after RecordSuccess")
	}
}

func TestLoginLimiter_TrustedProxies(t *testing.T) {
	limiter := NewLoginLimiter([]string{"10.0.0.1"})

	reqTrusted := httptest.NewRequest("POST", "/api/auth/login", nil)
	reqTrusted.RemoteAddr = "10.0.0.1:45678"
	reqTrusted.Header.Set("X-Forwarded-For", "203.0.113.195, 10.0.0.1")

	ip := limiter.GetClientIP(reqTrusted)
	if ip != "203.0.113.195" {
		t.Errorf("expected client IP 203.0.113.195 from trusted proxy, got %s", ip)
	}

	reqUntrusted := httptest.NewRequest("POST", "/api/auth/login", nil)
	reqUntrusted.RemoteAddr = "192.168.1.88:12345"
	reqUntrusted.Header.Set("X-Forwarded-For", "203.0.113.195")

	ipUntrusted := limiter.GetClientIP(reqUntrusted)
	if ipUntrusted != "192.168.1.88" {
		t.Errorf("expected remote IP 192.168.1.88 from untrusted source, got %s", ipUntrusted)
	}
}
