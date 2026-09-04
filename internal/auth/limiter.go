package auth

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// LoginLimiter handles IP rate limiting and account lockout according to SPEC.md section 6.1:
// - Rate Limit: max 5 failed attempts / 1 minute / IP (returns 429)
// - Account Lockout: 10 consecutive failed attempts in 15 minutes for username/badge_code -> locked 15 minutes
type LoginLimiter struct {
	mu              sync.Mutex
	trustedProxies  []string
	ipFailures      map[string][]time.Time
	accountFailures map[string]*accountLockState
}

type accountLockState struct {
	failures []time.Time
	lockedAt time.Time
}

// NewLoginLimiter creates a new rate limiter with trusted proxies.
func NewLoginLimiter(trustedProxies []string) *LoginLimiter {
	return &LoginLimiter{
		trustedProxies:  trustedProxies,
		ipFailures:      make(map[string][]time.Time),
		accountFailures: make(map[string]*accountLockState),
	}
}

// GetClientIP extracts client IP checking trusted proxies.
func (l *LoginLimiter) GetClientIP(r *http.Request) string {
	remoteIP, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteIP = r.RemoteAddr
	}

	isTrusted := false
	for _, proxy := range l.trustedProxies {
		if strings.TrimSpace(proxy) == remoteIP {
			isTrusted = true
			break
		}
	}

	if isTrusted {
		xff := r.Header.Get("X-Forwarded-For")
		if xff != "" {
			parts := strings.Split(xff, ",")
			clientIP := strings.TrimSpace(parts[0])
			if clientIP != "" {
				return clientIP
			}
		}
	}

	return remoteIP
}

// CheckAllowed checks if request is allowed by IP rate limit and Account lock.
// Returns (allowedIP, allowedAccount, retryAfterSeconds).
func (l *LoginLimiter) CheckAllowed(ip, accountKey string) (bool, bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	allowedIP, ipRetry := l.checkIPLimit(ip, now)
	allowedAccount, accRetry := l.checkAccountLock(accountKey, now)

	retryAfter := ipRetry
	if accRetry > retryAfter {
		retryAfter = accRetry
	}

	return allowedIP, allowedAccount, retryAfter
}

func (l *LoginLimiter) checkIPLimit(ip string, now time.Time) (bool, int) {
	if ip == "" {
		return true, 0
	}

	var validTimes []time.Time
	for _, t := range l.ipFailures[ip] {
		if now.Sub(t) < time.Minute {
			validTimes = append(validTimes, t)
		}
	}
	l.ipFailures[ip] = validTimes

	if len(validTimes) >= 5 {
		oldest := validTimes[0]
		ra := int(time.Minute.Seconds() - now.Sub(oldest).Seconds())
		if ra < 1 {
			ra = 1
		}
		return false, ra
	}

	return true, 0
}

func (l *LoginLimiter) checkAccountLock(accountKey string, now time.Time) (bool, int) {
	if accountKey == "" {
		return true, 0
	}

	st, exists := l.accountFailures[accountKey]
	if !exists {
		return true, 0
	}

	if !st.lockedAt.IsZero() {
		if now.Sub(st.lockedAt) < 15*time.Minute {
			ra := int((15 * time.Minute).Seconds() - now.Sub(st.lockedAt).Seconds())
			if ra < 1 {
				ra = 1
			}
			return false, ra
		}
		st.lockedAt = time.Time{}
		st.failures = nil
		return true, 0
	}

	var validTimes []time.Time
	for _, t := range st.failures {
		if now.Sub(t) < 15*time.Minute {
			validTimes = append(validTimes, t)
		}
	}
	st.failures = validTimes
	return true, 0
}

// RecordFailure increments failed attempts for both IP and accountKey.
// Returns true if account just became locked.
func (l *LoginLimiter) RecordFailure(ip, accountKey string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()

	if ip != "" {
		l.ipFailures[ip] = append(l.ipFailures[ip], now)
	}

	if accountKey != "" {
		st, exists := l.accountFailures[accountKey]
		if !exists {
			st = &accountLockState{}
			l.accountFailures[accountKey] = st
		}

		st.failures = append(st.failures, now)
		if len(st.failures) >= 10 {
			st.lockedAt = now
			st.failures = nil
			return true
		}
	}

	return false
}

// RecordSuccess clears failures for the account when login succeeds.
func (l *LoginLimiter) RecordSuccess(accountKey string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if accountKey != "" {
		delete(l.accountFailures, accountKey)
	}
}
