package response

import (
	"encoding/json"
	"net/http"
)

// Envelope represents the unified API response format.
type Envelope struct {
	Data       any         `json:"data,omitempty"`
	Pagination *Pagination `json:"pagination,omitempty"`
	Error      *ErrorBody  `json:"error,omitempty"`
}

// Pagination metadata for list endpoints.
type Pagination struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

// ErrorBody details for failure responses.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// JSON renders data into the standard Envelope response.
func JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(Envelope{Data: data}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// Paginated renders a paginated list of items in the standard Envelope format.
func Paginated(w http.ResponseWriter, status int, data any, page, limit, total int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(Envelope{
		Data: data,
		Pagination: &Pagination{
			Page:  page,
			Limit: limit,
			Total: total,
		},
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// Error renders structured error responses in the standard Envelope format.
func Error(w http.ResponseWriter, status int, code, message string, details any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(Envelope{
		Error: &ErrorBody{
			Code:    code,
			Message: message,
			Details: details,
		},
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
