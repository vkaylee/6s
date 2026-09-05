package apperror

import (
	"errors"
	"fmt"
	"net/http"

	"6s/internal/i18n"
)

// AppError requires an i18n.Key for every error.
type AppError struct {
	HTTPStatus int
	Code       string
	Key        i18n.Key
	Args       []any
	Err        error
	Details    any
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Key, e.Err)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Key)
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// WithCause attaches underlying error.
func (e *AppError) WithCause(err error) *AppError {
	e.Err = err
	return e
}

// WithDetails attaches custom metadata.
func (e *AppError) WithDetails(details any) *AppError {
	e.Details = details
	return e
}

// New creates an AppError enforcing i18n.Key.
func New(status int, code string, key i18n.Key, args ...any) *AppError {
	return &AppError{
		HTTPStatus: status,
		Code:       code,
		Key:        key,
		Args:       args,
	}
}

// BadRequest helper.
func BadRequest(key i18n.Key, args ...any) *AppError {
	return New(http.StatusBadRequest, "BAD_REQUEST", key, args...)
}

// Unauthorized helper.
func Unauthorized(key i18n.Key, args ...any) *AppError {
	return New(http.StatusUnauthorized, "UNAUTHORIZED", key, args...)
}

// Forbidden helper.
func Forbidden(key i18n.Key, args ...any) *AppError {
	return New(http.StatusForbidden, "FORBIDDEN", key, args...)
}

// NotFound helper.
func NotFound(key i18n.Key, args ...any) *AppError {
	return New(http.StatusNotFound, "NOT_FOUND", key, args...)
}

// Conflict helper.
func Conflict(code string, key i18n.Key, args ...any) *AppError {
	if code == "" {
		code = "CONFLICT"
	}
	return New(http.StatusConflict, code, key, args...)
}

// Internal helper.
func Internal(key i18n.Key, args ...any) *AppError {
	return New(http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", key, args...)
}

// TooManyRequests helper.
func TooManyRequests(key i18n.Key, args ...any) *AppError {
	return New(http.StatusTooManyRequests, "TOO_MANY_REQUESTS", key, args...)
}

// As extracts *AppError if target implements it.
func As(err error) (*AppError, bool) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr, true
	}
	return nil, false
}
