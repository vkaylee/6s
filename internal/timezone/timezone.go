// Package timezone provides IANA timezone validation and resolution helpers.
package timezone

import (
	"fmt"
	"time"
)

// Default is the system fallback IANA timezone name.
const Default = "Asia/Ho_Chi_Minh"

// Validate checks if name is a recognized non-empty IANA timezone.
func Validate(name string) error {
	if name == "" {
		return nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil || loc.String() != name {
		return fmt.Errorf("invalid IANA timezone %q", name)
	}
	return nil
}

// Resolve returns the user override timezone, falling back to site timezone, then default.
func Resolve(userTimezone, siteTimezone string) (*time.Location, error) {
	name := userTimezone
	if name == "" {
		name = siteTimezone
	}
	if name == "" {
		name = Default
	}
	if err := Validate(name); err != nil {
		return nil, err
	}
	return time.LoadLocation(name)
}
