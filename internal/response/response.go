package response

import (
	"encoding/json"
	"net/http"

	"6s/internal/apperror"
	"6s/internal/i18n"
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
	Key     string `json:"key,omitempty"`
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

// (Deprecated direct error helpers removed to enforce AppError with i18n)

// AppError renders an *apperror.AppError with localized message based on request context.
func AppError(w http.ResponseWriter, r *http.Request, appErr *apperror.AppError) {
	locale := i18n.FromContext(r.Context())
	msg := i18n.Translate(locale, appErr.Key, appErr.Args...)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(appErr.HTTPStatus)
	if err := json.NewEncoder(w).Encode(Envelope{
		Error: &ErrorBody{
			Code:    appErr.Code,
			Key:     string(appErr.Key),
			Message: msg,
			Details: appErr.Details,
		},
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// RenderError handles generic errors, extracting *apperror.AppError if present or falling back to internal server error.
func RenderError(w http.ResponseWriter, r *http.Request, err error) {
	if appErr, ok := apperror.As(err); ok {
		AppError(w, r, appErr)
		return
	}
	AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
}
