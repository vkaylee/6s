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

// IsValid checks if status is a recognized issue lifecycle value.
func (s Status) IsValid() bool {
	switch s {
	case StatusOpen, StatusPendingReview, StatusClosed, StatusInvalid:
		return true
	default:
		return false
	}
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

// CauseStatus represents cause verification state.
type CauseStatus string

const (
	CauseStatusUnverified    CauseStatus = "UNVERIFIED"
	CauseStatusConfirmed     CauseStatus = "CONFIRMED"
	CauseStatusNotApplicable CauseStatus = "NOT_APPLICABLE"
)

func (s CauseStatus) String() string { return string(s) }

func (s CauseStatus) IsValid() bool {
	switch s {
	case CauseStatusUnverified, CauseStatusConfirmed, CauseStatusNotApplicable:
		return true
	default:
		return false
	}
}

func isValidCauseStatus(status string) bool { return CauseStatus(status).IsValid() }

// VisibilityClass controls issue visibility within a site.
type VisibilityClass string

const (
	VisibilitySitePublic       VisibilityClass = "SITE_PUBLIC"
	VisibilitySafetyRestricted VisibilityClass = "SAFETY_RESTRICTED"
)

func (v VisibilityClass) String() string { return string(v) }

func (v VisibilityClass) IsValid() bool {
	return v == VisibilitySitePublic || v == VisibilitySafetyRestricted
}

// LocationSnapshotSource records where a location name snapshot came from.
type LocationSnapshotSource string

const (
	LocationSnapshotClient LocationSnapshotSource = "CLIENT_CAPTURE"
	LocationSnapshotServer LocationSnapshotSource = "SERVER_CAPTURE"
)

func (s LocationSnapshotSource) String() string { return string(s) }

func (s LocationSnapshotSource) IsValid() bool {
	return s == LocationSnapshotClient || s == LocationSnapshotServer
}

// ResponsibilityType identifies a user's location responsibility.
type ResponsibilityType string

const (
	ResponsibilityOwner    ResponsibilityType = "OWNER"
	ResponsibilityBackup   ResponsibilityType = "BACKUP"
	ResponsibilityReviewer ResponsibilityType = "REVIEWER"
)

func (r ResponsibilityType) String() string { return string(r) }

func (r ResponsibilityType) IsValid() bool {
	return r == ResponsibilityOwner || r == ResponsibilityBackup || r == ResponsibilityReviewer
}

// HistoryAction is the stable API action for responsibility history.
type HistoryAction string

const (
	HistoryActionAssign      HistoryAction = "ASSIGN"
	HistoryActionTransfer    HistoryAction = "TRANSFER"
	HistoryActionCauseVerify HistoryAction = "CAUSE_VERIFY"
	HistoryActionOther       HistoryAction = "OTHER"
)

func (a HistoryAction) String() string { return string(a) }

func (a HistoryAction) IsValid() bool {
	switch a {
	case HistoryActionAssign, HistoryActionTransfer, HistoryActionCauseVerify, HistoryActionOther:
		return true
	default:
		return false
	}
}

type auditAction string

const (
	auditActionAssignResponsibility auditAction = "ASSIGN_RESPONSIBILITY"
	auditActionVerifyCause          auditAction = "VERIFY_CAUSE"
)

func (a auditAction) String() string { return string(a) }
