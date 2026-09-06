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
	LocaleZH      = "zh"
	DefaultLocale = LocaleEN
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
	ErrLocationNotFound        Key = "masterdata.location_not_found"
	ErrLocationUpdateFailed    Key = "masterdata.location_update_failed"
	ErrTagQueryFailed          Key = "masterdata.tag_query_failed"
	ErrTagMissingFields        Key = "masterdata.tag_missing_fields"
	ErrTagSaveFailed           Key = "masterdata.tag_save_failed"
	ErrTagUpdateFailed         Key = "masterdata.tag_update_failed"
	ErrNotificationLoadFailed  Key = "notification.load_failed"
	ErrNotificationSaveFailed  Key = "notification.save_failed"
	ErrNotificationTestMissing Key = "notification.test_missing_config"
	ErrLeaderboardFailed       Key = "scoring.leaderboard_failed"
	ErrRulesLoadFailed         Key = "scoring.rules_load_failed"
	ErrMissingRulesReason      Key = "scoring.missing_rules_reason"
	ErrInvalidRules            Key = "scoring.invalid_rules"
	ErrScoreLogsFailed         Key = "scoring.score_logs_failed"
	ErrAILoadFailed            Key = "ai.load_failed"
	ErrAISaveFailed            Key = "ai.save_failed"
	ErrAINotEnabled            Key = "ai.not_enabled"
	ErrAIModelMissing          Key = "ai.model_missing"
	ErrAITranslateFailed       Key = "ai.translate_failed"
	ErrAITestFailed            Key = "ai.test_failed"
	ErrAIBaseURLMissing        Key = "ai.base_url_missing"
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
		ErrLocationNotFound:        "Không tìm thấy vị trí nhà xưởng",
		ErrLocationUpdateFailed:    "Lỗi cập nhật trạng thái vị trí",
		ErrTagQueryFailed:          "Lỗi truy vấn danh mục tags",
		ErrTagMissingFields:        "Mã tag, tên tiếng Việt và phân loại S là bắt buộc",
		ErrTagSaveFailed:           "Lỗi lưu thông tin tag",
		ErrTagUpdateFailed:         "Lỗi cập nhật trạng thái tag",
		ErrNotificationLoadFailed:  "Không thể tải cấu hình thông báo",
		ErrNotificationSaveFailed:  "Lưu cấu hình thông báo thất bại",
		ErrNotificationTestMissing: "Chưa thiết lập cấu hình thông báo để test",
		ErrLeaderboardFailed:       "Không thể tải bảng xếp hạng",
		ErrRulesLoadFailed:         "Không thể tải quy tắc chấm điểm",
		ErrMissingRulesReason:      "Bắt buộc cung cấp lý do (reason) khi áp dụng hồi tố điểm (apply_from)",
		ErrInvalidRules:            "Quy tắc điểm không hợp lệ",
		ErrScoreLogsFailed:         "Không thể tải lịch sử cộng trừ điểm",
		ErrAILoadFailed:            "Không thể tải cấu hình AI",
		ErrAISaveFailed:            "Lưu cấu hình AI thất bại",
		ErrAINotEnabled:            "Dịch vụ AI chưa được kích hoạt",
		ErrAIModelMissing:          "Chưa cấu hình model AI",
		ErrAITranslateFailed:       "Dịch thuật qua AI thất bại: %v",
		ErrAITestFailed:            "Kiểm tra kết nối AI thất bại: %v",
		ErrAIBaseURLMissing:        "Chưa cấu hình AI Base URL",
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
		ErrLocationNotFound:        "Factory location not found",
		ErrLocationUpdateFailed:    "Failed to update location status",
		ErrTagQueryFailed:          "Failed to query tags",
		ErrTagMissingFields:        "Tag code, Vietnamese name, and 6S category are required",
		ErrTagSaveFailed:           "Failed to save tag",
		ErrTagUpdateFailed:         "Failed to update tag status",
		ErrNotificationSaveFailed:  "Failed to save notification settings",
		ErrNotificationTestMissing: "Notification configuration not configured for testing",
		ErrLeaderboardFailed:       "Failed to load leaderboard",
		ErrRulesLoadFailed:         "Failed to load scoring rules",
		ErrMissingRulesReason:      "Reason is required when applying retroactive scoring (apply_from)",
		ErrInvalidRules:            "Invalid scoring rules",
		ErrScoreLogsFailed:         "Failed to load score history",
		ErrAILoadFailed:            "Failed to load AI configuration",
		ErrAISaveFailed:            "Failed to save AI configuration",
		ErrAINotEnabled:            "AI service is not enabled",
		ErrAIModelMissing:          "AI model is not configured",
		ErrAITranslateFailed:       "AI translation failed: %v",
		ErrAITestFailed:            "AI connection test failed: %v",
		ErrAIBaseURLMissing:        "AI Base URL is not configured",
	},
	LocaleZH: {
		ErrInternal:                "内部服务器错误",
		ErrBadRequest:              "无效的请求",
		ErrUnauthorized:            "请先登录",
		ErrForbidden:               "无权执行此操作",
		ErrNotFound:                "未找到资源",
		ErrConflict:                "资源冲突或已被修改",
		ErrInvalidInput:            "输入数据无效: %v",
		ErrTokenExpired:            "会话已过期",
		ErrInvalidToken:            "认证令牌无效或已过期",
		ErrAccountLocked:           "账号已被锁定",
		ErrInvalidCreds:            "账号或密码错误",
		ErrMissingAuth:             "缺少 Authorization 头",
		ErrInvalidAuthFmt:          "Authorization 格式无效（需要 Bearer <token>）",
		ErrUserNotFound:            "用户不存在",
		ErrUserQuery:               "查询用户信息失败",
		ErrMissingLoginInput:       "请输入账号或工卡号",
		ErrLoginRateLimit:          "登录尝试过于频繁（限制5次/分钟）",
		ErrAccountLockedTemp:       "由于连续输错10次，账号已被临时锁定15分钟",
		ErrMissingRefreshToken:     "缺少 refresh token",
		ErrInvalidRefreshToken:     "refresh token 无效或已过期",
		ErrADConfigNotFound:        "未找到用于测试的 Active Directory 配置",
		ErrADTestFailed:            "Active Directory 连接测试失败: %v",
		ErrSessionsQueryFailed:     "查询活动会话列表失败",
		ErrAdminExists:             "系统已存在管理员，无法重新初始化",
		ErrUsernameTooShort:        "账号长度至少需要3个字符",
		ErrPasswordTooShort:        "密码长度至少需要8个字符",
		ErrMissingFullName:         "请输入姓名",
		ErrSetupFailed:             "创建初始管理员失败",
		ErrInvalidID:               "无效的 ID",
		ErrIssueNotFound:           "未找到该问题",
		ErrIssueConflict:           "问题状态或版本冲突",
		ErrIssueVersionChanged:     "该问题已被其他用户修改",
		ErrInvalidMultipart:        "无效的 multipart 表单数据",
		ErrMultipartTooLarge:       "上传文件大小超出限制",
		ErrMissingIssueFields:      "缺少必填字段: client_uuid, category, location_code",
		ErrMissingPhotoBefore:      "缺少必填照片: photo_before",
		ErrMissingPhotoAfter:       "缺少必填照片: photo_after",
		ErrMissingResolvedUUID:     "缺少 resolved_client_uuid",
		ErrInvalidCategory:         "无效的 6S 类别（1S - 6S）",
		ErrIssueSaveFailed:         "无法保存问题: %v",
		ErrIssueCloseForbidden:     "您无权审核关闭此问题",
		ErrIssueReopenForbidden:    "您无权重新打开此问题",
		ErrIssueInvalidForbidden:   "仅管理员或安全员可作废此问题",
		ErrIssuePatchForbidden:     "您无权编辑此问题",
		ErrIssueListFailed:         "获取问题列表失败",
		ErrIssueGetFailed:          "获取问题详情失败",
		ErrLocationQueryFailed:     "查询位置列表失败",
		ErrLocationMissingFields:   "位置代码、越南语名称和二维码为必填项",
		ErrLocationCreateFailed:    "无法创建位置（代码或二维码可能已存在）",
		ErrLocationNotFound:        "未找到车间位置",
		ErrLocationUpdateFailed:    "更新位置状态失败",
		ErrTagQueryFailed:          "查询标签列表失败",
		ErrTagMissingFields:        "标签代码、越南语名称和 6S 类别为必填项",
		ErrTagSaveFailed:           "保存标签信息失败",
		ErrTagUpdateFailed:         "更新标签状态失败",
		ErrNotificationSaveFailed:  "保存通知配置失败",
		ErrNotificationTestMissing: "未配置用于测试的通知设置",
		ErrLeaderboardFailed:       "加载排行榜失败",
		ErrScoreLogsFailed:         "无法加载评分记录",
		ErrRulesLoadFailed:         "加载评分规则失败",
		ErrMissingRulesReason:      "追溯积分规则调整时必须提供原因 (reason)",
		ErrInvalidRules:            "评分规则无效",
		ErrAILoadFailed:            "无法加载AI配置",
		ErrAISaveFailed:            "保存AI配置失败",
		ErrAINotEnabled:            "AI服务未启用",
		ErrAIModelMissing:          "未配置AI模型",
		ErrAITranslateFailed:       "AI翻译失败: %v",
		ErrAITestFailed:            "AI连接测试失败: %v",
		ErrAIBaseURLMissing:        "未配置AI Base URL",
	},
}

type ctxKey struct{}

var localeKey = ctxKey{}

// Normalize maps raw input to supported locale ("vi", "en", "zh"), default "en".
func Normalize(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if strings.HasPrefix(raw, "vi") {
		return LocaleVI
	}
	if strings.HasPrefix(raw, "zh") {
		return LocaleZH
	}
	if strings.HasPrefix(raw, "en") {
		return LocaleEN
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
