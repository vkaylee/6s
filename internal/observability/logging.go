package observability

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"
)

var (
	emailPattern = regexp.MustCompile(`(?i)([a-z0-9])[a-z0-9._%+\-]*@([a-z0-9.\-]+\.[a-z]{2,})`)
	phonePattern = regexp.MustCompile(`\+[0-9][0-9\s().-]{7,}[0-9]`)
	queryPattern = regexp.MustCompile(`(?i)([?&](?:token|key|secret|password|app_token|webhook)=)[^&\s]+`)
)

// Log emits one JSON object with safe, structured fields.
func Log(level, message string, fields map[string]any) {
	event := make(map[string]any, len(fields)+6)
	event["timestamp"] = time.Now().UTC().Format(time.RFC3339Nano)
	event["level"] = strings.ToUpper(level)
	event["severity"] = strings.ToLower(level)
	event["service"] = "6s"
	event["request_id"] = "system"
	event["message"] = Redact(message)
	for key, value := range fields {
		if key == "request_id" && value != nil && fmt.Sprint(value) != "" {
			event[key] = Redact(value)
			continue
		}
		event[key] = redactField(key, value)
	}
	encoded, err := json.Marshal(event)
	if err != nil {
		log.Print(`{"timestamp":"","level":"ERROR","severity":"error","service":"6s","request_id":"system","message":"log serialization failed"}`)
		return
	}
	log.Print(string(encoded))
}
func redactField(key string, value any) any {
	lowerKey := strings.ToLower(key)
	if strings.Contains(lowerKey, "password") || strings.Contains(lowerKey, "secret") ||
		strings.Contains(lowerKey, "token") || strings.Contains(lowerKey, "api_key") ||
		strings.Contains(lowerKey, "app_token") || strings.Contains(lowerKey, "webhook") {
		return "[REDACTED]"
	}
	if lowerKey == "email" || strings.Contains(lowerKey, "phone") {
		return maskPII(fmt.Sprint(value), lowerKey)
	}
	if lowerKey == "name" || strings.HasSuffix(lowerKey, "_name") || lowerKey == "user_agent" || lowerKey == "ip" || strings.Contains(lowerKey, "ip_address") {
		return maskPII(fmt.Sprint(value), lowerKey)
	}
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for nestedKey, nestedValue := range v {
			out[nestedKey] = redactField(nestedKey, nestedValue)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = redactField(key, item)
		}
		return out
	default:
		return Redact(value)
	}
}

func maskPII(value, field string) string {
	if value == "" {
		return ""
	}
	switch {
	case field == "email":
		return emailPattern.ReplaceAllString(value, `$1***@$2`)
	case field == "phone":
		return phonePattern.ReplaceAllStringFunc(value, func(phone string) string {
			trimmed := strings.Map(func(r rune) rune {
				if (r >= '0' && r <= '9') || r == '+' {
					return r
				}
				return -1
			}, phone)
			if len(trimmed) < 5 {
				return "[REDACTED]"
			}
			return trimmed[:4] + "***" + trimmed[len(trimmed)-3:]
		})
	case field == "name" || strings.HasSuffix(field, "_name"):
		runes := []rune(value)
		if len(runes) == 0 {
			return ""
		}
		return string(runes[0]) + "***"
	default:
		return fmt.Sprint(Redact(value))
	}
}

func Redact(value any) any {
	text, ok := value.(string)
	if !ok {
		return value
	}
	text = emailPattern.ReplaceAllString(text, `$1***@$2`)
	text = phonePattern.ReplaceAllStringFunc(text, func(phone string) string { return "[REDACTED]" })
	text = queryPattern.ReplaceAllString(text, `${1}[REDACTED]`)
	for _, marker := range []string{"password=", "token=", "secret=", "app_token=", "webhook="} {
		text = strings.ReplaceAll(text, marker, marker+"[REDACTED]")
	}
	return text
}
