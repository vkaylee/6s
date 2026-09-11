package issue

import (
	"6s/internal/db"
	"6s/internal/storage"
	"context"
	"errors"
)

// Domain errors.
var (
	ErrIssueNotFound    = errors.New("issue not found")
	ErrIssueConflict    = errors.New("issue version or status conflict")
	ErrPermissionDenied = errors.New("permission denied for action")
	ErrInvalidCategory  = errors.New("invalid 6S category")
)

// Response represents the full API format for an issue according to SPEC.md section 6.3.

// Response represents the full API format for an issue according to SPEC.md section 6.3.
type Response struct {
	ID                    int64     `json:"id"`
	ClientUUID            string    `json:"client_uuid"`
	Version               int32     `json:"version"`
	SiteID                int64     `json:"site_id"`
	AssigneeID            *int64    `json:"assignee_id,omitempty"`
	AssignedTeamID        *int64    `json:"assigned_team_id,omitempty"`
	VisibilityClass       string    `json:"visibility_class"`
	Category              string    `json:"category"`
	CauseType             string    `json:"cause_type"`
	LocationCode          string    `json:"location_code"`
	LocationName          string    `json:"location_name"`
	Tags                  []string  `json:"tags"`
	Description           *string   `json:"description"`
	TranslatedDescription *string   `json:"translated_description,omitempty"`
	RejectReason          *string   `json:"reject_reason"`
	PhotoBefore           string    `json:"photo_before"`
	PhotoDetail           *string   `json:"photo_detail"`
	PhotoAfter            *string   `json:"photo_after"`
	ScoreRating           int16     `json:"score_rating"`
	ScoreDeducted         int64     `json:"score_deducted"`
	Status                string    `json:"status"`
	Creator               UserItem  `json:"creator"`
	Resolver              *UserItem `json:"resolver"`
	CreatedAt             string    `json:"created_at"`
	ResolvedAt            *string   `json:"resolved_at"`
	ClosedAt              *string   `json:"closed_at"`
}

// UserItem formats summary user details in Response.

// UserItem formats summary user details in Response.
type UserItem struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	FullName string `json:"full_name"`
}

// Reader reads and pages issues.

// Reader reads and pages issues.
type Reader interface {
	GetIssueByID(ctx context.Context, id int64) (db.Issue, error)
	GetIssueByUUID(ctx context.Context, clientUUID string) (db.Issue, error)
	ListIssuesFiltered(ctx context.Context, arg db.ListIssuesFilteredParams) ([]db.ListIssuesFilteredRow, error)
	CountIssuesFiltered(ctx context.Context, arg db.CountIssuesFilteredParams) (int64, error)
}

// Writer mutates issue lifecycle state.

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
}

// TagStore manages issue tags and their usage counters.

// TagStore manages issue tags and their usage counters.
type TagStore interface {
	InsertIssueTag(ctx context.Context, arg db.InsertIssueTagParams) error
	DeleteIssueTags(ctx context.Context, issueID int64) error
	ListTagsForIssue(ctx context.Context, issueID int64) ([]db.ListTagsForIssueRow, error)
	ListTagsForIssues(ctx context.Context, issueIDs []int64) ([]db.ListTagsForIssuesRow, error)
	IncrementTagUseCount(ctx context.Context, code string) error
}

// ScoringStore records score deltas and reads configured rules.

// ScoringStore records score deltas and reads configured rules.
type ScoringStore interface {
	InsertScoreLog(ctx context.Context, arg db.InsertScoreLogParams) error
	GetScoringRuleByKey(ctx context.Context, ruleKey string) (db.ScoringRule, error)
}

// NotificationStore persists outbound notification events.

// NotificationStore persists outbound notification events.
type NotificationStore interface {
	CreateOutboxEntry(ctx context.Context, arg db.CreateOutboxEntryParams) (db.NotificationOutbox, error)
}

// AuditStore persists audit trail entries.

// AuditStore persists audit trail entries.
type AuditStore interface {
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
}

// DirectoryStore resolves locations and users.

// DirectoryStore resolves locations and users.
type DirectoryStore interface {
	GetLocationByCode(ctx context.Context, code string) (db.Location, error)
	GetUserByID(ctx context.Context, id int64) (db.User, error)
	ListActiveLocationCodesForUser(ctx context.Context, arg db.ListActiveLocationCodesForUserParams) ([]string, error)
}

// TranslationStore reads cached AI translations.

// TranslationStore reads cached AI translations.
type TranslationStore interface {
	GetTranslationCacheBatch(ctx context.Context, arg db.GetTranslationCacheBatchParams) ([]db.GetTranslationCacheBatchRow, error)
}

// Store is the full persistence surface required by the issue service.

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

// Atomic defines atomic operations for critical workflows.
type Atomic interface {
	CreateIssueWithSideEffects(ctx context.Context, issueParams db.CreateIssueParams, tags []string, buildOutbox func(issueID int64) []db.CreateOutboxEntryParams, buildScores func(issueID int64) []db.InsertScoreLogParams) (db.Issue, error)
	ResolveIssueAtomic(ctx context.Context, force bool, params db.ResolveIssueParams, forceParams db.ForceResolveIssueParams) (db.Issue, error)
}

// ServiceImpl manages issue lifecycle and business rules.

// ServiceImpl manages issue lifecycle and business rules.
type ServiceImpl struct {
	store          Store
	storageManager *storage.Manager
	notifyCh       chan struct{}
	hub            *Hub
}

// NewService creates a new issue Service.

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

// SubscribeEvents returns a channel receiving issue update events.
func (s *ServiceImpl) SubscribeEvents() (<-chan Event, func()) {
	return s.hub.Subscribe()
}

// OpenMedia authorizes issue visibility before opening its controlled attachment.

// broadcast emits an event to all active SSE subscribers.
func (s *ServiceImpl) broadcast(evt Event) {
	if s.hub != nil {
		s.hub.Broadcast(evt)
	}
}

// SyncIssueRequest parameters for POST /api/issues/sync.
