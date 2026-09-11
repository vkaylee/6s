package response

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// ParseIDParam extracts an int64 identifier from a chi route parameter.
func ParseIDParam(r *http.Request, param string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, param), 10, 64)
}

// ParsePageLimit parses page and limit from query values, applying defaults and bounds.
// Page defaults to 1 and ignores non-positive values; limit defaults to defaultLimit
// and ignores values outside [1, maxLimit].
func ParsePageLimit(q url.Values, defaultLimit, maxLimit int) (page, limit int) {
	page = 1
	if pStr := q.Get("page"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil && p > 0 {
			page = p
		}
	}

	limit = defaultLimit
	if lStr := q.Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= maxLimit {
			limit = l
		}
	}
	return page, limit
}
