package crypto

import (
	"encoding/base64"
	"testing"
)

func TestEncryptorRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	encodedKey := base64.StdEncoding.EncodeToString(key)

	enc, err := NewEncryptor(encodedKey)
	if err != nil {
		t.Fatalf("failed to init encryptor: %v", err)
	}

	secret := "SuperSecretBindPassword123!"
	cipherText, err := enc.Encrypt(secret)
	if err != nil {
		t.Fatalf("encryption failed: %v", err)
	}

	if cipherText == secret {
		t.Fatal("ciphertext should not match plaintext")
	}

	decrypted, err := enc.Decrypt(cipherText)
	if err != nil {
		t.Fatalf("decryption failed: %v", err)
	}

	if decrypted != secret {
		t.Errorf("expected %s, got %s", secret, decrypted)
	}
}

func TestEncryptorInvalidKey(t *testing.T) {
	_, err := NewEncryptor("short-key")
	if err != ErrInvalidKey {
		t.Errorf("expected ErrInvalidKey, got %v", err)
	}
}

func TestEncryptorEmptyString(t *testing.T) {
	enc, err := NewEncryptor("12345678901234567890123456789012")
	if err != nil {
		t.Fatalf("failed to init encryptor: %v", err)
	}

	ct, err := enc.Encrypt("")
	if err != nil || ct != "" {
		t.Errorf("expected empty string, got %q, err: %v", ct, err)
	}

	pt, err := enc.Decrypt("")
	if err != nil || pt != "" {
		t.Errorf("expected empty string, got %q, err: %v", pt, err)
	}
}
