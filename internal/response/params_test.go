package response

import (
	"context"
	"net/http"
	"net/url"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestParseIDParam(t *testing.T) {
	for _, tc := range []struct {
		name    string
		input   string
		want    int64
		wantErr bool
	}{
		{name: "valid positive", input: "42", want: 42},
		{name: "zero", input: "0", want: 0},
		{name: "negative", input: "-1", want: -1},
		{name: "empty is error", input: "", want: 0, wantErr: true},
		{name: "non-numeric is error", input: "abc", want: 0, wantErr: true},
		{name: "float string is error", input: "1.5", want: 0, wantErr: true},
		{name: "whitespace is error", input: " 5", want: 0, wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("id", tc.input)
			r := (&http.Request{}).WithContext(context.WithValue(context.Background(), chi.RouteCtxKey, rctx))
			got, err := ParseIDParam(r, "id")
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %d, want %d", got, tc.want)
			}
		})
	}
}

func TestParsePageLimit(t *testing.T) {
	base := url.Values{}

	t.Run("defaults when absent", func(t *testing.T) {
		page, limit := ParsePageLimit(base, 20, 100)
		if page != 1 || limit != 20 {
			t.Errorf("got page=%d limit=%d, want 1 20", page, limit)
		}
	})

	t.Run("respects provided values", func(t *testing.T) {
		q := url.Values{"page": {"3"}, "limit": {"50"}}
		page, limit := ParsePageLimit(q, 20, 100)
		if page != 3 || limit != 50 {
			t.Errorf("got page=%d limit=%d, want 3 50", page, limit)
		}
	})

	t.Run("non-positive page falls back to 1", func(t *testing.T) {
		q := url.Values{"page": {"0"}, "limit": {"10"}}
		page, limit := ParsePageLimit(q, 20, 100)
		if page != 1 || limit != 10 {
			t.Errorf("got page=%d limit=%d, want 1 10", page, limit)
		}
	})

	t.Run("limit above max falls back to default", func(t *testing.T) {
		q := url.Values{"page": {"1"}, "limit": {"200"}}
		page, limit := ParsePageLimit(q, 20, 100)
		if page != 1 || limit != 20 {
			t.Errorf("got page=%d limit=%d, want 1 20", page, limit)
		}
	})

	t.Run("non-numeric values fall back to defaults", func(t *testing.T) {
		q := url.Values{"page": {"x"}, "limit": {"y"}}
		page, limit := ParsePageLimit(q, 20, 100)
		if page != 1 || limit != 20 {
			t.Errorf("got page=%d limit=%d, want 1 20", page, limit)
		}
	})
}
