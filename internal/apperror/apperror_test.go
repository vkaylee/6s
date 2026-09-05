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

	// Test all helper constructors
	badReq := apperror.BadRequest(i18n.ErrBadRequest)
	if badReq.HTTPStatus != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", badReq.HTTPStatus)
	}

	unauth := apperror.Unauthorized(i18n.ErrUnauthorized)
	if unauth.HTTPStatus != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", unauth.HTTPStatus)
	}

	forbid := apperror.Forbidden(i18n.ErrForbidden)
	if forbid.HTTPStatus != http.StatusForbidden {
		t.Errorf("expected 403, got %d", forbid.HTTPStatus)
	}

	notF := apperror.NotFound(i18n.ErrNotFound)
	if notF.HTTPStatus != http.StatusNotFound {
		t.Errorf("expected 404, got %d", notF.HTTPStatus)
	}

	conf := apperror.Conflict("", i18n.ErrConflict)
	if conf.HTTPStatus != http.StatusConflict || conf.Code != "CONFLICT" {
		t.Errorf("expected 409 CONFLICT, got %d %s", conf.HTTPStatus, conf.Code)
	}

	tooMany := apperror.TooManyRequests(i18n.ErrLoginRateLimit)
	if tooMany.HTTPStatus != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", tooMany.HTTPStatus)
	}

	if badReq.Error() == "" {
		t.Error("expected non-empty Error string")
	}
}
