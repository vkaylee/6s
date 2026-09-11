package auth

import "database/sql"

// maskedAuditSource builds PII-masked client IP and user-agent audit fields.
// Empty inputs yield an invalid NullString so the column stores NULL.
func maskedAuditSource(ip, userAgent string) (sql.NullString, sql.NullString) {
	return sql.NullString{String: maskAuditValue(ip), Valid: ip != ""},
		sql.NullString{String: maskAuditValue(userAgent), Valid: userAgent != ""}
}
