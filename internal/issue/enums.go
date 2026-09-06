package issue

// Status represents the lifecycle status of an issue.
type Status string

// Predefined issue status values.
const (
	// StatusOpen indicates a newly reported issue.
	StatusOpen Status = "OPEN"
	// StatusPendingReview indicates an issue has an offline/online fix and is waiting for review.
	StatusPendingReview Status = "PENDING_REVIEW"
	// StatusClosed indicates an issue has been reviewed and closed.
	StatusClosed Status = "CLOSED"
	// StatusInvalid indicates an issue was dismissed as invalid.
	StatusInvalid Status = "INVALID"
)

// String returns string value of Status.
func (s Status) String() string {
	return string(s)
}

// Category represents a 6S category code.
type Category string

// Predefined 6S categories.
const (
	// Category1S represents Sort (Seiri).
	Category1S Category = "1S"
	// Category2S represents Set In Order (Seiton).
	Category2S Category = "2S"
	// Category3S represents Shine (Seiso).
	Category3S Category = "3S"
	// Category4S represents Standardize (Seiketsu).
	Category4S Category = "4S"
	// Category5S represents Sustain (Shitsuke).
	Category5S Category = "5S"
	// Category6S represents Safety.
	Category6S Category = "6S"
)

// String returns string value of Category.
func (c Category) String() string {
	return string(c)
}

// IsValid checks if category is a valid 6S category.
func (c Category) IsValid() bool {
	switch c {
	case Category1S, Category2S, Category3S, Category4S, Category5S, Category6S:
		return true
	default:
		return false
	}
}

// CauseType represents the 6S root cause nature (person vs object).
type CauseType string

const (
	// CauseTypeCondition represents physical condition, equipment or materials.
	CauseTypeCondition CauseType = "CONDITION"
	// CauseTypeBehavior represents human behavior, operation or SOP compliance.
	CauseTypeBehavior CauseType = "BEHAVIOR"
)

// String returns string value of CauseType.
func (c CauseType) String() string {
	return string(c)
}

// IsValid checks if cause type is valid.
func (c CauseType) IsValid() bool {
	return c == CauseTypeCondition || c == CauseTypeBehavior
}

// NormalizeCauseType resolves cause type from category/tag if not explicitly specified.
func NormalizeCauseType(causeType string, category string) string {
	if causeType == string(CauseTypeBehavior) || causeType == string(CauseTypeCondition) {
		return causeType
	}
	if category == string(Category5S) {
		return string(CauseTypeBehavior)
	}
	return string(CauseTypeCondition)
}
