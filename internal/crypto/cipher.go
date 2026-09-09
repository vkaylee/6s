// Package crypto provides application encryption helpers.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// ErrInvalidKey indicates that the provided master key is not 32 bytes.
var ErrInvalidKey = errors.New("crypto: encryption key must be 32 bytes")

// ErrCiphertextTooShort indicates that ciphertext does not contain standard GCM nonce bytes.
var ErrCiphertextTooShort = errors.New("crypto: ciphertext too short")

// Encryptor performs AES-256-GCM symmetric encryption for data at rest.
type Encryptor struct {
	key []byte
}

// Cipher is an alias for Encryptor.
type Cipher = Encryptor

// NewCipher is an alias for NewEncryptor.
var NewCipher = NewEncryptor

// NewEncryptor creates a new Encryptor using a 32-byte raw string or base64 key.
func NewEncryptor(base64OrRawKey string) (*Encryptor, error) {
	key, err := base64.StdEncoding.DecodeString(base64OrRawKey)
	if err != nil || len(key) != 32 {
		if len(base64OrRawKey) == 32 {
			key = []byte(base64OrRawKey)
		} else {
			return nil, ErrInvalidKey
		}
	}

	return &Encryptor{key: key}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM and returns standard base64 encoded ciphertext.
func (e *Encryptor) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("aes new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("new gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("read nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts base64 encoded AES-256-GCM ciphertext back to plaintext.
func (e *Encryptor) Decrypt(encodedCiphertext string) (string, error) {
	if encodedCiphertext == "" {
		return "", nil
	}

	data, err := base64.StdEncoding.DecodeString(encodedCiphertext)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("aes new cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("new gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", ErrCiphertextTooShort
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("gcm decrypt: %w", err)
	}

	return string(plaintext), nil
}
