package observability

import (
	"encoding/json"
	"log"
	"regexp"
	"strings"
	"time"
)

var (
	emailPattern = regexp.MustCompile(`(?i)[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}`)
	queryPattern = regexp.MustCompile(`(?i)([?&](?:token|key|secret|password|app_token|webhook)=)[^&\s]+`)
)

// Log emits one JSON object. Error text is redacted before serialization.
func Log(level, message string, fields map[string]any) {
	event := make(map[string]any, len(fields)+3)
	event["timestamp"] = time.Now().UTC().Format(time.RFC3339Nano)
	event["severity"] = level
	event["message"] = message
	for key, value := range fields {
		if key == "error" {
			value = Redact(value)
		}
		event[key] = value
	}
	encoded, err := json.Marshal(event)
	if err != nil {
		log.Printf(`{"timestamp":%q,"severity":"error","message":"log serialization failed"}`, time.Now().UTC().Format(time.RFC3339Nano))
		return
	}
	log.Print(string(encoded))
}

func Redact(value any) any {
	text, ok := value.(string)
	if !ok {
		return value
	}
	text = emailPattern.ReplaceAllString(text, "[redacted-email]")
	text = queryPattern.ReplaceAllString(text, `${1}[redacted]`)
	for _, marker := range []string{"password=", "token=", "secret=", "app_token="} {
		text = strings.ReplaceAll(text, marker, marker+"[redacted]")
	}
	return text
}
