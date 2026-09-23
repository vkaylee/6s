package issue

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"

	"6s/internal/db"
	"6s/internal/storage"
)

// Domain errors.
var (
	ErrIssueNotFound          = errors.New("issue not found")
	ErrIssueConflict          = errors.New("issue version or status conflict")
	ErrPermissionDenied       = errors.New("permission denied for action")
	ErrInvalidCategory        = errors.New("invalid 6S category")
	ErrInvalidResponsibility  = errors.New("invalid responsibility reference")
	ErrMissingExpectedVersion = errors.New("expected_version is required for responsibility changes")
)

// ResponsibilityHistoryEntry represents a responsibility change in an issue.
type ResponsibilityHistoryEntry struct {
	ID            int64           `json:"id"`
	Action        string          `json:"action"`
	ChangedBy     *int64          `json:"changed_by"`
	ChangedByName *string         `json:"changed_by_name"`
	OldValue      json.RawMessage `json:"old_value,omitempty"`
	NewValue      json.RawMessage `json:"new_value,omitempty"`
	CreatedAt     string          `json:"created_at"`
}

// AllowedActions lists the lifecycle actions available for an issue.
type AllowedActions struct {
	Assign      bool `json:"assign"`
	VerifyCause bool `json:"verify_cause"`
	Resolve     bool `json:"resolve"`
	Close       bool `json:"close"`
}

// Response represents the full API format for an issue according to SPEC.md section 6.3.
type Response struct {
	ID                         int64                        `json:"id"`
	ClientUUID                 string                       `json:"client_uuid"`
	Version                    int32                        `json:"version"`
	SiteID                     int64                        `json:"site_id"`
	AssigneeID                 *int64                       `json:"assignee_id"`
	AssignedTeamID             *int64                       `json:"assigned_team_id"`
	AssetID                    *int64                       `json:"asset_id"`
	CauseTeamID                *int64                       `json:"cause_team_id"`
	CauseStatus                string                       `json:"cause_status"`
	VisibilityClass            string                       `json:"visibility_class"`
	Category                   string                       `json:"category"`
	CauseType                  string                       `json:"cause_type"`
	LocationCode               string                       `json:"location_code"`
	LocationName               string                       `json:"location_name"`
	LocationNameViSnapshot     *string                      `json:"location_name_vi_snapshot,omitempty"`
	LocationNameZhSnapshot     *string                      `json:"location_name_zh_snapshot,omitempty"`
	LocationNameEnSnapshot     *string                      `json:"location_name_en_snapshot,omitempty"`
	LocationSnapshotSource     *string                      `json:"location_snapshot_source,omitempty"`
	LocationSnapshotRecordedAt *string                      `json:"location_snapshot_recorded_at,omitempty"`
	Tags                       []string                     `json:"tags"`
	Description                *string                      `json:"description"`
	TranslatedDescription      *string                      `json:"translated_description,omitempty"`
	RejectReason               *string                      `json:"reject_reason"`
	PhotoBefore                string                       `json:"photo_before"`
	PhotoDetail                *string                      `json:"photo_detail"`
	PhotoAfter                 *string                      `json:"photo_after"`
	ScoreRating                int16                        `json:"score_rating"`
	ScoreDeducted              int64                        `json:"score_deducted"`
	Status                     string                       `json:"status"`
	Creator                    UserItem                     `json:"creator"`
	Resolver                   *UserItem                    `json:"resolver"`
	CreatedAt                  string                       `json:"created_at"`
	ResolvedAt                 *string                      `json:"resolved_at"`
	ClosedAt                   *string                      `json:"closed_at"`
	ResponsibilityHistory      []ResponsibilityHistoryEntry `json:"responsibility_history,omitempty"`
	AllowedActions             *AllowedActions              `json:"allowed_actions,omitempty"`
}

// UserItem formats summary user details in a Response.
type UserItem struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	FullName string `json:"full_name"`
}

// Reader reads and pages issues.
type Reader interface {
	GetIssueByID(ctx context.Context, id int64) (db.Issue, error)
	GetIssueByUUID(ctx context.Context, clientUUID string) (db.Issue, error)
	ListIssuesFiltered(ctx context.Context, arg db.ListIssuesFilteredParams) ([]db.ListIssuesFilteredRow, error)
	CountIssuesFiltered(ctx context.Context, arg db.CountIssuesFilteredParams) (int64, error)
	GetIssueResponsibilityHistory(ctx context.Context, targetID string) ([]db.ListIssueResponsibilityHistoryRow, error)
	ListVisibleIssueEventRecipients(ctx context.Context, arg db.ListVisibleIssueEventRecipientsParams) ([]int64, error)
}

// Writer mutates issue lifecycle state.
type Writer interface {
	CreateIssue(ctx context.Context, arg db.CreateIssueParams) (db.Issue, error)
	ResolveIssue(ctx context.Context, arg db.ResolveIssueParams) (db.Issue, error)
	ForceResolveIssue(ctx context.Context, arg db.ForceResolveIssueParams) (db.Issue, error)
	CloseIssue(ctx context.Context, arg db.CloseIssueParams) (db.Issue, error)
	ReopenIssue(ctx context.Context, arg db.ReopenIssueParams) (db.Issue, error)
	InvalidateIssue(ctx context.Context, arg db.InvalidateIssueParams) (db.Issue, error)
	PatchIssue(ctx context.Context, arg db.PatchIssueParams) (db.Issue, error)
	PatchIssueWithTagsAtomic(ctx context.Context, arg db.PatchIssueParams, tags []string) (db.Issue, error)
	PatchIssueWithAuditAtomic(ctx context.Context, patch db.PatchIssueParams, tags []string, audit []db.InsertAuditLogParams) (db.Issue, error)
}

// ListFilter narrows an issue listing for list, count, and export parity.
type ListFilter struct {
	Statuses       []string
	Categories     []string
	LocationCodes  []string
	TagCode        *string
	Overdue        bool
	AssignedTeamID *int64
	MineTeam       bool
	Page           int
	Limit          int
}

// toListParams maps the filter onto the shared list query parameters.
func (f ListFilter) toListParams(user db.User) db.ListIssuesFilteredParams {
	return db.ListIssuesFilteredParams{
		Statuses: f.Statuses, Categories: f.Categories, LocationCodes: f.LocationCodes, TagCode: nullString(f.TagCode),
		Overdue:        sql.NullBool{Bool: f.Overdue, Valid: f.Overdue},
		AssignedTeamID: nullInt64(f.AssignedTeamID),
		MineTeam:       sql.NullBool{Bool: f.MineTeam, Valid: f.MineTeam},
		UserID:         user.ID, SiteID: user.SiteID, Role: user.Role,
		Offset: int32(f.Offset()), Limit: int32(f.Limit), //nolint:gosec // bounded by the handler
	}
}

// toCountParams maps the filter onto the shared count query parameters.
func (f ListFilter) toCountParams(user db.User) db.CountIssuesFilteredParams {
	return db.CountIssuesFilteredParams{
		Statuses: f.Statuses, Categories: f.Categories, LocationCodes: f.LocationCodes, TagCode: nullString(f.TagCode),
		Overdue:        sql.NullBool{Bool: f.Overdue, Valid: f.Overdue},
		AssignedTeamID: nullInt64(f.AssignedTeamID),
		MineTeam:       sql.NullBool{Bool: f.MineTeam, Valid: f.MineTeam},
		UserID:         user.ID, SiteID: user.SiteID, Role: user.Role,
	}
}

// Offset returns the zero-based row offset for the current page.
func (f ListFilter) Offset() int {
	page := f.Page
	if page < 1 {
		page = 1
	}
	return (page - 1) * f.Limit
}

// TagStore manages issue tags and their usage counters.
type TagStore interface {
	InsertIssueTag(ctx context.Context, arg db.InsertIssueTagParams) error
	DeleteIssueTags(ctx context.Context, issueID int64) error
	ListTagsForIssue(ctx context.Context, issueID int64) ([]db.ListTagsForIssueRow, error)
	ListTagsForIssues(ctx context.Context, issueIDs []int64) ([]db.ListTagsForIssuesRow, error)
	IncrementTagUseCount(ctx context.Context, code string) error
}

// ScoringStore records score deltas and reads configured rules.
type ScoringStore interface {
	InsertScoreLog(ctx context.Context, arg db.InsertScoreLogParams) error
	GetScoringRuleByKey(ctx context.Context, ruleKey string) (db.ScoringRule, error)
}

// NotificationStore persists outbound notification events.
type NotificationStore interface {
	CreateOutboxEntry(ctx context.Context, arg db.CreateOutboxEntryParams) (db.NotificationOutbox, error)
}

// AuditStore persists audit trail entries.
type AuditStore interface {
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// DirectoryStore resolves locations, users, assets, and teams.
type DirectoryStore interface {
	GetLocationByCode(ctx context.Context, code string) (db.Location, error)
	GetUserByID(ctx context.Context, id int64) (db.User, error)
	GetAssetByID(ctx context.Context, id int64) (db.Asset, error)
	GetTeamByID(ctx context.Context, id int64) (db.Team, error)
	GetTeamMembership(ctx context.Context, arg db.GetTeamMembershipParams) (db.TeamMembership, error)
	ListActiveLocationCodesForUser(ctx context.Context, arg db.ListActiveLocationCodesForUserParams) ([]string, error)
}

// TranslationStore reads cached AI translations.
type TranslationStore interface {
	GetTranslationCacheBatch(ctx context.Context, arg db.GetTranslationCacheBatchParams) ([]db.GetTranslationCacheBatchRow, error)
}

// Store is the full persistence surface required by the issue service.
type Store interface {
	Reader
	Writer
	TagStore
	ScoringStore
	NotificationStore
	AuditStore
	DirectoryStore
	TranslationStore
}

// Atomic defines atomic operations for critical workflows.
type Atomic interface {
	CreateIssueWithSideEffects(ctx context.Context, issueParams db.CreateIssueParams, tags []string, buildOutbox func(issueID int64) []db.CreateOutboxEntryParams, buildScores func(issueID int64) []db.InsertScoreLogParams) (db.Issue, error)
	ResolveIssueAtomic(ctx context.Context, force bool, params db.ResolveIssueParams, forceParams db.ForceResolveIssueParams) (db.Issue, error)
}

// ServiceImpl manages issue lifecycle and business rules.
type ServiceImpl struct {
	store          Store
	storageManager *storage.Manager
	notifyCh       chan struct{}
	hub            *Hub
}

// NewService creates a new issue Service.
func NewService(store Store, storageManager *storage.Manager, notifyCh chan struct{}) *ServiceImpl {
	return &ServiceImpl{
		store:          store,
		storageManager: storageManager,
		notifyCh:       notifyCh,
		hub:            NewHub(),
	}
}

// SubscribeEvents returns a channel receiving issue update events.
func (s *ServiceImpl) SubscribeEvents(userID ...int64) (<-chan Event, func()) {
	return s.hub.Subscribe(userID...)
}

// broadcast resolves visibility for all active subscribers once, then publishes the same
// audience-bound event to every channel. A failed lookup drops the event for all subscribers
// rather than leaking it, matching the per-subscriber detail check it replaces.
func (s *ServiceImpl) broadcast(ctx context.Context, evt Event) {
	if s.hub == nil {
		return
	}
	ids := s.hub.SubscriberIDs()
	if len(ids) == 0 {
		// Direct service tests may subscribe without an identity. Production SSE always
		// supplies currentUser.ID and therefore takes batched visibility path below.
		s.hub.Broadcast(evt)
		return
	}
	visible, err := s.store.ListVisibleIssueEventRecipients(ctx, db.ListVisibleIssueEventRecipientsParams{UserIds: ids, IssueID: evt.IssueID})
	if err != nil {
		log.Printf("failed to resolve issue event recipients: %v", err)
		return
	}
	s.hub.Broadcast(evt.withRecipients(visible))
}

// SyncIssueRequest parameters for POST /api/issues/sync.
