package apperror_test

import (
	"errors"
	"net/http"
	"testing"

	"6s/internal/apperror"
	"6s/internal/i18n"
)

func TestAppError(t *testing.T) {
	rootCause := errors.New("db connection failure")
	err := apperror.Internal(i18n.ErrInternal).WithCause(rootCause).WithDetails(map[string]string{"retry": "false"})

	if err.HTTPStatus != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", err.HTTPStatus)
	}
	if err.Key != i18n.ErrInternal {
		t.Fatalf("expected ErrInternal, got %v", err.Key)
	}
	if !errors.Is(err, rootCause) {
		t.Fatalf("expected unwrap to match rootCause")
	}

	appErr, ok := apperror.As(err)
	if !ok || appErr == nil {
		t.Fatalf("expected As to return valid AppError")
	}
}
