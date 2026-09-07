package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestTokenManager_GenerateAndValidate(t *testing.T) {
	secret := []byte("very-secure-jwt-secret-for-factory-6s")
	tm := NewTokenManager(secret)

	userID := int64(42)
	tokenStr, exp, err := tm.GenerateAccessToken(userID)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	if exp != int64(AccessTokenDuration.Seconds()) {
		t.Errorf("expected exp %d, got %d", int64(AccessTokenDuration.Seconds()), exp)
	}

	parsedID, err := tm.ValidateAccessToken(tokenStr)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}
	if parsedID != userID {
		t.Errorf("expected userID %d, got %d", userID, parsedID)
	}

	// Test invalid signature
	wrongTM := NewTokenManager([]byte("wrong-secret-key-12345678901234567890"))
	_, err = wrongTM.ValidateAccessToken(tokenStr)
	if err == nil {
		t.Error("expected validation to fail with wrong secret")
	}

	// Test expired token
	claims := jwt.RegisteredClaims{
		Subject:   "42",
		IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
	}
	expiredToken := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	expiredStr, _ := expiredToken.SignedString(secret)

	_, err = tm.ValidateAccessToken(expiredStr)
	if err == nil {
		t.Error("expected expired token to fail")
	}
}

func TestNewTokenManagerRejectsEmptySecret(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic on empty secret")
		}
	}()
	NewTokenManager(nil)
}

func TestNewTokenManagerRejectsShortSecret(t *testing.T) {
	// HS256 keys shorter than 32 bytes are below RFC 7518 §3.2 requirements.
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic on secret shorter than 32 bytes")
		}
	}()
	NewTokenManager([]byte("too-short"))
}

func TestTokenDurationPolicyMaximums(t *testing.T) {
	if AccessTokenDuration > 15*time.Minute {
		t.Errorf("access token TTL %v exceeds policy maximum 15m", AccessTokenDuration)
	}
	if RefreshTokenDuration > 7*24*time.Hour {
		t.Errorf("refresh token TTL %v exceeds policy maximum 7d", RefreshTokenDuration)
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	rawToken, hash, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	if len(rawToken) != RefreshTokenBytes*2 {
		t.Errorf("expected hex length %d, got %d", RefreshTokenBytes*2, len(rawToken))
	}

	expectedHash := HashRefreshToken(rawToken)
	if hash != expectedHash {
		t.Errorf("hash mismatch: got %s, expected %s", hash, expectedHash)
	}
}
