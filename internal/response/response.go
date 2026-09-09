// Package response provides unified JSON API response helpers.
package response

import (
	"bytes"
	"encoding/json"
	"io"
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

// JSON writes a successful JSON response envelope.
func JSON(w http.ResponseWriter, status int, data any) error {
	return writeJSON(w, status, Envelope{Data: data})
}

// Paginated writes a JSON response envelope with pagination metadata.
func Paginated(w http.ResponseWriter, status int, data any, page, limit, total int) error {
	return writeJSON(w, status, Envelope{
		Data:       data,
		Pagination: &Pagination{Page: page, Limit: limit, Total: total},
	})
}

func writeJSON(w http.ResponseWriter, status int, payload Envelope) error {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(payload); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	n, err := w.Write(body.Bytes())
	if err != nil {
		return err
	}
	if n != body.Len() {
		return io.ErrShortWrite
	}
	return nil
}

// (Deprecated direct error helpers removed to enforce AppError with i18n)

// AppError writes an application error response translated for the request locale.
func AppError(w http.ResponseWriter, r *http.Request, appErr *apperror.AppError) error {
	locale := i18n.FromContext(r.Context())
	msg := i18n.Translate(locale, appErr.Key, appErr.Args...)
	return writeJSON(w, appErr.HTTPStatus, Envelope{Error: &ErrorBody{
		Code: appErr.Code, Key: string(appErr.Key), Message: msg,
	}})
}

// RenderError handles generic errors, extracting *apperror.AppError if present or falling back to internal server error.
func RenderError(w http.ResponseWriter, r *http.Request, err error) error {
	if appErr, ok := apperror.As(err); ok {
		return AppError(w, r, appErr)
	}
	return AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
}
