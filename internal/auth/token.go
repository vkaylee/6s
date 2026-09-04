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

const (
	// AccessTokenDuration defines the standard 1-hour lifetime for access tokens.
	AccessTokenDuration = 3600 * time.Second

	// RefreshTokenDuration defines the 30-day lifetime for refresh tokens.
	RefreshTokenDuration = 30 * 24 * time.Hour

	// RefreshTokenBytes defines the entropy size (32 bytes) for refresh tokens.
	RefreshTokenBytes = 32
)

// TokenManager signs and validates JWT access tokens.
type TokenManager struct {
	secretKey []byte
}

// NewTokenManager initializes TokenManager with a secret key.
func NewTokenManager(secretKey []byte) *TokenManager {
	if len(secretKey) == 0 {
		panic("JWT secretKey cannot be empty")
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
