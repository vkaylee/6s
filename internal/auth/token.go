package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken indicates an expired, forged, or unparseable JWT token.
var ErrInvalidToken = errors.New("invalid or expired token")

// ErrInvalidSub indicates an invalid or missing subject claim in the JWT.
var ErrInvalidSub = errors.New("invalid token subject")

// MinSecretLen is the minimum JWT HMAC secret length in bytes, matching the
// HS256 output size per RFC 7518 §3.2.
const MinSecretLen = 32

const (
	// AccessTokenDuration is the 15-minute web-session lifetime required by
	// the access-control policy.
	AccessTokenDuration = 15 * time.Minute

	// RefreshTokenDuration is the 7-day web-session lifetime required by the
	// access-control policy.
	RefreshTokenDuration = 7 * 24 * time.Hour

	// RefreshTokenBytes defines the entropy size (32 bytes) for refresh tokens.
	RefreshTokenBytes = 32
)

// TokenManager signs and validates JWT access tokens.
type TokenManager struct {
	secretKey []byte
}

// NewTokenManager initializes TokenManager with a secret key. It fails closed
// on empty or sub-32-byte secrets (RFC 7518 §3.2 for HS256).
func NewTokenManager(secretKey []byte) *TokenManager {
	if len(secretKey) < MinSecretLen {
		panic(fmt.Sprintf("JWT secretKey must be at least %d bytes", MinSecretLen))
	}
	return &TokenManager{secretKey: secretKey}
}

// GenerateAccessToken signs a minimal JWT containing only sub (userID), exp, iat.
func (m *TokenManager) GenerateAccessToken(userID int64) (string, int64, error) {
	now := time.Now()
	expiresAt := now.Add(AccessTokenDuration)

	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(expiresAt),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(m.secretKey)
	if err != nil {
		return "", 0, fmt.Errorf("failed to sign access token: %w", err)
	}

	return tokenString, int64(AccessTokenDuration.Seconds()), nil
}

// ValidateAccessToken parses and verifies a JWT access token, returning the user_id.
func (m *TokenManager) ValidateAccessToken(tokenStr string) (int64, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return m.secretKey, nil
	})

	if err != nil || !token.Valid {
		return 0, ErrInvalidToken
	}

	claims, ok := token.Claims.(*jwt.RegisteredClaims)
	if !ok || claims.Subject == "" {
		return 0, ErrInvalidSub
	}

	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		return 0, ErrInvalidSub
	}

	return userID, nil
}

// GenerateRefreshToken creates a high-entropy random string and its SHA-256 hash for database storage.
func GenerateRefreshToken() (rawToken string, tokenHash string, err error) {
	b := make([]byte, RefreshTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("failed to generate random refresh token: %w", err)
	}

	rawToken = hex.EncodeToString(b)
	tokenHash = HashRefreshToken(rawToken)
	return rawToken, tokenHash, nil
}

// HashRefreshToken hashes a raw refresh token using SHA-256 for lookup and storage in DB.
func HashRefreshToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}
