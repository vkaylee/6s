package timezone

import "testing"

func TestResolvePrecedenceAndValidation(t *testing.T) {
	loc, err := Resolve("Europe/Berlin", "Asia/Ho_Chi_Minh")
	if err != nil || loc.String() != "Europe/Berlin" {
		t.Fatalf("user timezone must override site: %v, %v", loc, err)
	}
	loc, err = Resolve("", "Asia/Ho_Chi_Minh")
	if err != nil || loc.String() != "Asia/Ho_Chi_Minh" {
		t.Fatalf("site timezone must be fallback: %v, %v", loc, err)
	}
	if err := Validate("UTC+7"); err == nil {
		t.Fatal("fixed offsets must be rejected")
	}
}
