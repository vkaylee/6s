package auth

import (
	"testing"
)

func TestHashAndVerifyPassword(t *testing.T) {
	// Use small params for fast test
	params := Argon2Params{
		Memory:      1024,
		Iterations:  1,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
	}

	rawPass := "FactoryPassword123!"
	hashed, err := HashPasswordWithParams(rawPass, params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if hashed == "" {
		t.Fatal("expected non-empty hash")
	}

	match, err := VerifyPassword(rawPass, hashed)
	if err != nil {
		t.Fatalf("VerifyPassword error: %v", err)
	}
	if !match {
		t.Error("expected password to match")
	}

	// Wrong password
	matchWrong, err := VerifyPassword("WrongPassword", hashed)
	if err != nil {
		t.Fatalf("VerifyPassword error: %v", err)
	}
	if matchWrong {
		t.Error("expected wrong password to fail")
	}

	// Invalid hash format
	_, err = VerifyPassword(rawPass, "invalid-hash")
	if err == nil {
		t.Error("expected error for invalid hash")
	}
}
