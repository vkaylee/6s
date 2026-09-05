package i18n

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// Key defines type-safe message identifiers.
type Key string

// Supported locale identifiers.
const (
	LocaleVI      = "vi"
	LocaleEN      = "en"
	DefaultLocale = LocaleVI
)

// Common error keys.
const (
	ErrInternal                Key = "error.internal"
	ErrBadRequest              Key = "error.bad_request"
	ErrUnauthorized            Key = "error.unauthorized"
	ErrForbidden               Key = "error.forbidden"
	ErrNotFound                Key = "error.not_found"
	ErrConflict                Key = "error.conflict"
	ErrInvalidInput            Key = "error.invalid_input"
	ErrTokenExpired            Key = "auth.token_expired"
	ErrInvalidToken            Key = "auth.invalid_token"
	ErrAccountLocked           Key = "auth.account_locked"
	ErrInvalidCreds            Key = "auth.invalid_credentials"
	ErrMissingAuth             Key = "auth.missing_header"
	ErrInvalidAuthFmt          Key = "auth.invalid_header_format"
	ErrUserNotFound            Key = "auth.user_not_found"
	ErrUserQuery               Key = "auth.user_query_error"
	ErrMissingLoginInput       Key = "auth.missing_login_input"
	ErrLoginRateLimit          Key = "auth.rate_limit_exceeded"
	ErrAccountLockedTemp       Key = "auth.account_locked_temporary"
	ErrMissingRefreshToken     Key = "auth.missing_refresh_token"
	ErrInvalidRefreshToken     Key = "auth.invalid_refresh_token"
	ErrADConfigNotFound        Key = "auth.ad_config_not_found"
	ErrADTestFailed            Key = "auth.ad_test_failed"
	ErrSessionsQueryFailed     Key = "auth.sessions_query_failed"
	ErrAdminExists             Key = "auth.admin_already_exists"
	ErrUsernameTooShort        Key = "auth.username_too_short"
	ErrPasswordTooShort        Key = "auth.password_too_short"
	ErrMissingFullName         Key = "auth.missing_full_name"
	ErrSetupFailed             Key = "auth.setup_failed"
	ErrInvalidID               Key = "issue.invalid_id"
	ErrIssueNotFound           Key = "issue.not_found"
	ErrIssueConflict           Key = "issue.conflict"
	ErrIssueVersionChanged     Key = "issue.version_changed"
	ErrInvalidMultipart        Key = "issue.invalid_multipart"
	ErrMultipartTooLarge       Key = "issue.multipart_too_large"
	ErrMissingIssueFields      Key = "issue.missing_required_fields"
	ErrMissingPhotoBefore      Key = "issue.missing_photo_before"
	ErrMissingPhotoAfter       Key = "issue.missing_photo_after"
	ErrMissingResolvedUUID     Key = "issue.missing_resolved_client_uuid"
	ErrInvalidCategory         Key = "issue.invalid_category"
	ErrIssueSaveFailed         Key = "issue.save_failed"
	ErrIssueCloseForbidden     Key = "issue.close_forbidden"
	ErrIssueReopenForbidden    Key = "issue.reopen_forbidden"
	ErrIssueInvalidForbidden   Key = "issue.invalid_forbidden"
	ErrIssuePatchForbidden     Key = "issue.patch_forbidden"
	ErrIssueListFailed         Key = "issue.list_failed"
	ErrIssueGetFailed          Key = "issue.get_failed"
	ErrLocationQueryFailed     Key = "masterdata.location_query_failed"
	ErrLocationMissingFields   Key = "masterdata.location_missing_fields"
	ErrLocationCreateFailed    Key = "masterdata.location_create_failed"
	ErrTagQueryFailed          Key = "masterdata.tag_query_failed"
	ErrTagMissingFields        Key = "masterdata.tag_missing_fields"
	ErrTagSaveFailed           Key = "masterdata.tag_save_failed"
	ErrNotificationLoadFailed  Key = "notification.load_failed"
	ErrNotificationSaveFailed  Key = "notification.save_failed"
	ErrNotificationTestMissing Key = "notification.test_missing_config"
	ErrLeaderboardFailed       Key = "scoring.leaderboard_failed"
	ErrRulesLoadFailed         Key = "scoring.rules_load_failed"
	ErrMissingRulesReason      Key = "scoring.missing_rules_reason"
	ErrInvalidRules            Key = "scoring.invalid_rules"
)

// ponytail: hardcoded in-memory dictionary; upgrade to embed.FS or external catalog if multi-file translators needed.
var catalog = map[string]map[Key]string{
	LocaleVI: {
		ErrInternal:                "Lỗi máy chủ nội bộ",
		ErrBadRequest:              "Yêu cầu không hợp lệ",
		ErrUnauthorized:            "Yêu cầu đăng nhập",
		ErrForbidden:               "Bạn không có quyền thực hiện hành động này",
		ErrNotFound:                "Không tìm thấy tài nguyên",
		ErrConflict:                "Dữ liệu bị xung đột hoặc đã bị thay đổi",
		ErrInvalidInput:            "Dữ liệu nhập không hợp lệ: %v",
		ErrADConfigNotFound:        "Chưa có cấu hình Active Directory để kiểm tra",
		ErrADTestFailed:            "Kiểm tra kết nối Active Directory thất bại: %v",
		ErrSessionsQueryFailed:     "Lỗi truy vấn danh sách phiên đăng nhập",
		ErrAdminExists:             "Hệ thống đã có quản trị viên. Không thể khởi tạo lại.",
		ErrUsernameTooShort:        "Tên tài khoản phải có ít nhất 3 ký tự",
		ErrPasswordTooShort:        "Mật khẩu phải có ít nhất 8 ký tự",
		ErrMissingFullName:         "Vui lòng nhập họ và tên",
		ErrSetupFailed:             "Lỗi tạo tài khoản quản trị viên ban đầu",
		ErrAccountLocked:           "Tài khoản đã bị khóa",
		ErrInvalidCreds:            "Thông tin đăng nhập không chính xác",
		ErrMissingAuth:             "Thiếu header Authorization",
		ErrInvalidAuthFmt:          "Định dạng header Authorization không hợp lệ (cần Bearer <token>)",
		ErrUserNotFound:            "Người dùng không tồn tại",
		ErrLoginRateLimit:          "Vượt quá giới hạn thử đăng nhập (5 lần/phút)",
		ErrAccountLockedTemp:       "Tài khoản bị tạm khóa 15 phút do nhập sai 10 lần liên tiếp",
		ErrMissingLoginInput:       "Vui lòng nhập tên tài khoản hoặc mã thẻ",
		ErrMissingRefreshToken:     "Thiếu refresh token",
		ErrInvalidRefreshToken:     "Refresh token không hợp lệ hoặc đã hết hạn",
		ErrInvalidID:               "id không hợp lệ",
		ErrIssueNotFound:           "Không tìm thấy issue",
		ErrIssueConflict:           "Phiên bản hoặc trạng thái issue bị xung đột",
		ErrIssueVersionChanged:     "Phiên bản issue đã bị thay đổi bởi người dùng khác",
		ErrInvalidMultipart:        "Dữ liệu multipart không hợp lệ",
		ErrMultipartTooLarge:       "Dữ liệu multipart không hợp lệ: dung lượng vượt quá giới hạn",
		ErrMissingIssueFields:      "Thiếu trường bắt buộc: client_uuid, category, location_code",
		ErrMissingPhotoBefore:      "Thiếu ảnh bắt buộc: photo_before",
		ErrMissingPhotoAfter:       "Thiếu ảnh bắt buộc: photo_after",
		ErrMissingResolvedUUID:     "Thiếu resolved_client_uuid",
		ErrInvalidCategory:         "Phân loại 6S không hợp lệ (1S - 6S)",
		ErrIssueSaveFailed:         "Không thể lưu issue: %v",
		ErrIssueCloseForbidden:     "Bạn không có quyền duyệt đạt issue này",
		ErrIssueReopenForbidden:    "Bạn không có quyền mở lại issue này",
		ErrIssueInvalidForbidden:   "Chỉ quản trị viên hoặc cán bộ an toàn mới được bác bỏ issue",
		ErrIssuePatchForbidden:     "Bạn không có quyền chỉnh sửa issue này",
		ErrIssueListFailed:         "Không thể lấy danh sách issue",
		ErrIssueGetFailed:          "Không thể tải chi tiết issue",
		ErrLocationQueryFailed:     "Lỗi truy vấn danh mục vị trí",
		ErrLocationMissingFields:   "Mã vị trí, tên tiếng Việt và QR code là bắt buộc",
		ErrLocationCreateFailed:    "Không thể tạo vị trí (có thể trùng mã code hoặc qr_code)",
		ErrTagQueryFailed:          "Lỗi truy vấn danh mục tags",
		ErrTagMissingFields:        "Mã tag, tên tiếng Việt và phân loại S là bắt buộc",
		ErrTagSaveFailed:           "Lỗi lưu thông tin tag",
		ErrNotificationLoadFailed:  "Không thể tải cấu hình thông báo",
		ErrNotificationSaveFailed:  "Lưu cấu hình thông báo thất bại",
		ErrNotificationTestMissing: "Chưa thiết lập cấu hình thông báo để test",
		ErrLeaderboardFailed:       "Không thể tải bảng xếp hạng",
		ErrRulesLoadFailed:         "Không thể tải quy tắc chấm điểm",
		ErrMissingRulesReason:      "Bắt buộc cung cấp lý do (reason) khi áp dụng hồi tố điểm (apply_from)",
		ErrInvalidRules:            "Quy tắc điểm không hợp lệ",
	},
	LocaleEN: {
		ErrSessionsQueryFailed:     "Failed to query active sessions",
		ErrAdminExists:             "Administrator already configured. Cannot re-initialize.",
		ErrUsernameTooShort:        "Username must be at least 3 characters",
		ErrPasswordTooShort:        "Password must be at least 8 characters",
		ErrMissingFullName:         "Full name is required",
		ErrSetupFailed:             "Failed to create initial administrator",
		ErrBadRequest:              "Bad request",
		ErrUnauthorized:            "Authentication required",
		ErrForbidden:               "Access denied",
		ErrNotFound:                "Resource not found",
		ErrConflict:                "Resource conflict or version mismatch",
		ErrInvalidInput:            "Invalid input: %v",
		ErrTokenExpired:            "Session expired",
		ErrInvalidToken:            "Invalid or expired authentication token",
		ErrAccountLocked:           "Account is locked",
		ErrInvalidCreds:            "Invalid username or password",
		ErrMissingAuth:             "Missing Authorization header",
		ErrInvalidAuthFmt:          "Invalid Authorization header format (expected Bearer <token>)",
		ErrUserNotFound:            "User not found",
		ErrUserQuery:               "Failed to query user information",
		ErrMissingLoginInput:       "Please enter username or badge code",
		ErrLoginRateLimit:          "Too many login attempts (5 times/minute)",
		ErrMissingRefreshToken:     "Missing refresh token",
		ErrInvalidRefreshToken:     "Invalid or expired refresh token",
		ErrADConfigNotFound:        "No Active Directory configuration found to test",
		ErrAccountLockedTemp:       "Account temporarily locked for 15 minutes due to 10 consecutive failed attempts",
		ErrIssueNotFound:           "Issue not found",
		ErrIssueConflict:           "Issue status or version conflict",
		ErrIssueVersionChanged:     "Issue has been modified by another user",
		ErrInvalidMultipart:        "Invalid multipart form data",
		ErrMultipartTooLarge:       "Multipart form size exceeds limit",
		ErrMissingIssueFields:      "Missing required fields: client_uuid, category, location_code",
		ErrMissingPhotoBefore:      "Missing required photo: photo_before",
		ErrMissingPhotoAfter:       "Missing required photo: photo_after",
		ErrMissingResolvedUUID:     "Missing resolved_client_uuid",
		ErrInvalidCategory:         "Invalid 6S category (1S - 6S)",
		ErrIssueSaveFailed:         "Cannot save issue: %v",
		ErrIssueCloseForbidden:     "You do not have permission to close this issue",
		ErrIssueReopenForbidden:    "You do not have permission to reopen this issue",
		ErrIssueInvalidForbidden:   "Only admins or safety officers can invalidate this issue",
		ErrIssuePatchForbidden:     "You do not have permission to edit this issue",
		ErrIssueListFailed:         "Failed to load issues list",
		ErrIssueGetFailed:          "Failed to load issue details",
		ErrLocationQueryFailed:     "Failed to query locations",
		ErrLocationMissingFields:   "Location code, Vietnamese name, and QR code are required",
		ErrLocationCreateFailed:    "Failed to create location (code or qr_code may be duplicated)",
		ErrTagQueryFailed:          "Failed to query tags",
		ErrTagMissingFields:        "Tag code, Vietnamese name, and 6S category are required",
		ErrTagSaveFailed:           "Failed to save tag",
		ErrNotificationLoadFailed:  "Failed to load notification settings",
		ErrNotificationSaveFailed:  "Failed to save notification settings",
		ErrNotificationTestMissing: "Notification configuration not configured for testing",
		ErrLeaderboardFailed:       "Failed to load leaderboard",
		ErrRulesLoadFailed:         "Failed to load scoring rules",
		ErrMissingRulesReason:      "Reason is required when applying retroactive scoring (apply_from)",
		ErrInvalidRules:            "Invalid scoring rules",
	},
}

type ctxKey struct{}

var localeKey = ctxKey{}

// Normalize maps raw input to supported locale ("vi", "en"), default "vi".
func Normalize(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if strings.HasPrefix(raw, "en") {
		return LocaleEN
	}
	if strings.HasPrefix(raw, "vi") {
		return LocaleVI
	}
	return DefaultLocale
}

// WithLocale stores locale into context.
func WithLocale(ctx context.Context, locale string) context.Context {
	return context.WithValue(ctx, localeKey, Normalize(locale))
}

// FromContext extracts locale from context.
func FromContext(ctx context.Context) string {
	if ctx == nil {
		return DefaultLocale
	}
	if val, ok := ctx.Value(localeKey).(string); ok && val != "" {
		return val
	}
	return DefaultLocale
}

// Translate converts Key into localized message with optional format arguments.
func Translate(locale string, key Key, args ...any) string {
	loc := Normalize(locale)
	messages, exists := catalog[loc]
	if !exists {
		messages = catalog[DefaultLocale]
	}

	msg, found := messages[key]
	if !found {
		// Fallback to default locale
		if loc != DefaultLocale {
			if defMsg, defFound := catalog[DefaultLocale][key]; defFound {
				msg = defMsg
				found = true
			}
		}
	}

	if !found {
		return string(key)
	}

	if len(args) > 0 {
		return fmt.Sprintf(msg, args...)
	}
	return msg
}

// Middleware extracts locale from X-Locale header, ?lang/?locale query, or Accept-Language header.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var selected string

		// 1. Explicit custom header from frontend
		if h := r.Header.Get("X-Locale"); h != "" {
			selected = h
		} else if q := r.URL.Query().Get("lang"); q != "" { // 2. Query param ?lang=
			selected = q
		} else if q := r.URL.Query().Get("locale"); q != "" { // 3. Query param ?locale=
			selected = q
		} else if al := r.Header.Get("Accept-Language"); al != "" { // 4. Accept-Language header
			// e.g. "en-US,en;q=0.9,vi;q=0.8" -> take first token
			parts := strings.Split(al, ",")
			if len(parts) > 0 {
				selected = strings.Split(parts[0], ";")[0]
			}
		}

		ctx := WithLocale(r.Context(), selected)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
