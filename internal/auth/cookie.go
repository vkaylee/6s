package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"time"

	"6s/internal/apperror"
	"6s/internal/i18n"
	"6s/internal/response"
)

const (
	AccessCookieName  = "6s_access"
	RefreshCookieName = "6s_refresh"
	CSRFCookieName    = "6s_csrf"

	accessCookiePath  = "/api"
	refreshCookiePath = "/api/auth"
	csrfCookiePath    = "/"
)

// NewCSRFMiddleware protects every unsafe API request with a double-submit
// token and an exact same-origin check. It also bootstraps the readable CSRF
// cookie on safe requests and on rejected unsafe requests.
func NewCSRFMiddleware(secureCookies bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if err := ensureCSRFCookie(w, r, secureCookies); err != nil {
				_ = response.AppError(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
				return
			}
			if isUnsafeMethod(r.Method) && (!validCSRFToken(r) || !validSameOrigin(r, secureCookies)) {
				_ = response.AppError(w, r, apperror.Forbidden(i18n.ErrForbidden))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isUnsafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return false
	default:
		return true
	}
}

func newCSRFToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func cookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func ensureCSRFCookie(w http.ResponseWriter, r *http.Request, secureCookies bool) error {
	if cookieValue(r, CSRFCookieName) != "" {
		return nil
	}
	token, err := newCSRFToken()
	if err != nil {
		return err
	}
	http.SetCookie(w, buildCookie(CSRFCookieName, token, csrfCookiePath, 0, secureCookies, false))
	return nil
}

func validCSRFToken(r *http.Request) bool {
	cookieToken := cookieValue(r, CSRFCookieName)
	headerToken := strings.TrimSpace(r.Header.Get("X-CSRF-Token"))
	if cookieToken == "" || headerToken == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookieToken), []byte(headerToken)) == 1
}

func validSameOrigin(r *http.Request, secureCookies bool) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	referer := strings.TrimSpace(r.Header.Get("Referer"))
	if origin == "" {
		origin = referer
	}
	if origin == "" || !sameOriginURL(origin, r.Host, secureCookies) {
		return false
	}
	return referer == "" || sameOriginURL(referer, r.Host, secureCookies)
}

func sameOriginURL(raw, host string, secureCookies bool) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil {
		return false
	}
	if secureCookies && !strings.EqualFold(u.Scheme, "https") {
		return false
	}
	requestScheme := u.Scheme
	if requestScheme != "http" && requestScheme != "https" {
		return false
	}
	requestURL, err := url.Parse(requestScheme + "://" + host)
	if err != nil || requestURL.Host == "" {
		return false
	}
	return strings.EqualFold(u.Hostname(), requestURL.Hostname()) &&
		effectivePort(u, requestScheme) == effectivePort(requestURL, requestScheme)
}
func effectivePort(u *url.URL, scheme string) string {
	if port := u.Port(); port != "" {
		return port
	}
	if scheme == "https" {
		return "443"
	}
	return "80"
}

func buildCookie(name, value, path string, maxAge int, secure, httpOnly bool) *http.Cookie {
	cookie := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     path,
		MaxAge:   maxAge,
		Secure:   secure,
		HttpOnly: httpOnly,
		SameSite: http.SameSiteStrictMode,
	}
	if maxAge < 0 {
		cookie.Expires = time.Unix(1, 0).UTC()
	}
	return cookie
}

func setSessionCookies(w http.ResponseWriter, accessToken, refreshToken string, secureCookies bool) error {
	csrfToken, err := newCSRFToken()
	if err != nil {
		return err
	}
	http.SetCookie(w, buildCookie(AccessCookieName, accessToken, accessCookiePath, int(AccessTokenDuration.Seconds()), secureCookies, true))
	http.SetCookie(w, buildCookie(RefreshCookieName, refreshToken, refreshCookiePath, int(RefreshTokenDuration.Seconds()), secureCookies, true))
	http.SetCookie(w, buildCookie(CSRFCookieName, csrfToken, csrfCookiePath, int(RefreshTokenDuration.Seconds()), secureCookies, false))
	return nil
}

func noStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
}
func clearSessionCookies(w http.ResponseWriter, secureCookies bool) {
	http.SetCookie(w, buildCookie(AccessCookieName, "", accessCookiePath, -1, secureCookies, true))
	http.SetCookie(w, buildCookie(RefreshCookieName, "", refreshCookiePath, -1, secureCookies, true))
	http.SetCookie(w, buildCookie(CSRFCookieName, "", csrfCookiePath, -1, secureCookies, false))
}
