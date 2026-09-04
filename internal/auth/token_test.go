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

	if exp != 3600 {
		t.Errorf("expected exp 3600, got %d", exp)
	}

	parsedID, err := tm.ValidateAccessToken(tokenStr)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}
	if parsedID != userID {
		t.Errorf("expected userID %d, got %d", userID, parsedID)
	}

	// Test invalid signature
	wrongTM := NewTokenManager([]byte("wrong-secret-key-1234567890123456"))
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
