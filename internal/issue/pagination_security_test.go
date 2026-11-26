package issue

import (
	"math"
	"testing"

	"6s/internal/db"
)

func TestListParamsPaginationBounds(t *testing.T) {
	tests := []struct {
		name        string
		page, limit int
		offset      int32
		invalid     bool
	}{
		{"default page", 0, 20, 0, false},
		{"negative page", -5, 20, 0, false},
		{"maximum offset", math.MaxInt32 + 1, 1, math.MaxInt32, false},
		{"offset too large", math.MaxInt32/20 + 2, 20, 0, true},
		{"overflowing multiplication", math.MaxInt, 20, 0, true},
		{"maximum limit", 1, math.MaxInt32, 0, false},
		{"zero limit", 1, 0, 0, true},
		{"negative limit", 1, -1, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params, err := (ListFilter{Page: tt.page, Limit: tt.limit}).toListParams(db.User{})
			if (err != nil) != tt.invalid {
				t.Fatalf("error = %v, invalid = %v", err, tt.invalid)
			}
			if err == nil && (params.Offset != tt.offset || int(params.Limit) != tt.limit) {
				t.Fatalf("offset = %d, limit = %d", params.Offset, params.Limit)
			}
		})
	}
	if math.MaxInt > math.MaxInt32 {
		t.Run("limit exceeds int32", func(t *testing.T) {
			overLimit := math.MaxInt32
			overLimit++
			if _, err := (ListFilter{Page: 1, Limit: overLimit}).toListParams(db.User{}); err == nil {
				t.Fatal("expected error when limit exceeds MaxInt32")
			}
		})
	}
}
