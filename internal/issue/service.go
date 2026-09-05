package issue

import (
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/storage"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mime/multipart"
	"strconv"
	"strings"
	"time"
)

// Domain errors.
var (
	ErrIssueNotFound    = errors.New("issue not found")
	ErrIssueConflict    = errors.New("issue version or status conflict")
	ErrPermissionDenied = errors.New("permission denied for action")
	ErrInvalidCategory  = errors.New("invalid 6S category")
)

// Response represents the full API format for an issue according to SPEC.md section 6.3.
type Response struct {
	ID           int64     `json:"id"`
	ClientUUID   string    `json:"client_uuid"`
	Version      int32     `json:"version"`
	Category     string    `json:"category"`
	LocationCode string    `json:"location_code"`
	LocationName string    `json:"location_name"`
	Tags         []string  `json:"tags"`
	Description  *string   `json:"description"`
	RejectReason *string   `json:"reject_reason"`
	PhotoBefore  string    `json:"photo_before"`
	PhotoDetail  *string   `json:"photo_detail"`
	PhotoAfter   *string   `json:"photo_after"`
	ScoreRating  int16     `json:"score_rating"`
	Status       string    `json:"status"`
	Creator      UserItem  `json:"creator"`
	Resolver     *UserItem `json:"resolver"`
	CreatedAt    string    `json:"created_at"`
	ResolvedAt   *string   `json:"resolved_at"`
	ClosedAt     *string   `json:"closed_at"`
}

// UserItem formats summary user details in Response.
type UserItem struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	FullName string `json:"full_name"`
}

// Store defines database operations required by the issue service.
type Store interface {
	GetIssueByID(ctx context.Context, id int64) (db.Issue, error)
	GetIssueByUUID(ctx context.Context, clientUUID string) (db.Issue, error)
	CreateIssue(ctx context.Context, arg db.CreateIssueParams) (db.Issue, error)
	InsertIssueTag(ctx context.Context, arg db.InsertIssueTagParams) error
	ListTagsForIssue(ctx context.Context, issueID int64) ([]db.ListTagsForIssueRow, error)
	DeleteIssueTags(ctx context.Context, issueID int64) error
	IncrementTagUseCount(ctx context.Context, code string) error
	ListIssuesFiltered(ctx context.Context, arg db.ListIssuesFilteredParams) ([]db.ListIssuesFilteredRow, error)
	CountIssuesFiltered(ctx context.Context, arg db.CountIssuesFilteredParams) (int64, error)
	ResolveIssue(ctx context.Context, arg db.ResolveIssueParams) (db.Issue, error)
	ForceResolveIssue(ctx context.Context, arg db.ForceResolveIssueParams) (db.Issue, error)
	CloseIssue(ctx context.Context, arg db.CloseIssueParams) (db.Issue, error)
	ReopenIssue(ctx context.Context, arg db.ReopenIssueParams) (db.Issue, error)
	InvalidateIssue(ctx context.Context, arg db.InvalidateIssueParams) (db.Issue, error)
	PatchIssue(ctx context.Context, arg db.PatchIssueParams) (db.Issue, error)
	CreateOutboxEntry(ctx context.Context, arg db.CreateOutboxEntryParams) (db.NotificationOutbox, error)
	InsertScoreLog(ctx context.Context, arg db.InsertScoreLogParams) error
	InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error
	GetLocationByCode(ctx context.Context, code string) (db.Location, error)
	GetUserByID(ctx context.Context, id int64) (db.User, error)
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
func (s *ServiceImpl) SubscribeEvents() (<-chan Event, func()) {
	return s.hub.Subscribe()
}

// broadcast emits an event to all active SSE subscribers.
func (s *ServiceImpl) broadcast(evt Event) {
	if s.hub != nil {
		s.hub.Broadcast(evt)
	}
}

// SyncIssueRequest parameters for POST /api/issues/sync.
type SyncIssueRequest struct {
	ClientUUID   string
	Category     string
	LocationCode string
	Tags         []string
	Description  string
	PhotoBefore  *multipart.FileHeader
	PhotoDetail  *multipart.FileHeader
}

// SyncIssue handles creating or idempotently returning an issue.
func (s *ServiceImpl) SyncIssue(ctx context.Context, req SyncIssueRequest, currentUser db.User) (*Response, bool, error) {
	existing, err := s.store.GetIssueByUUID(ctx, req.ClientUUID)
	if err == nil {
		resp, gErr := s.GetIssueByID(ctx, existing.ID)
		return resp, false, gErr
	}

	beforeBasename, detailBasename, err := s.saveSyncPhotos(req)
	if err != nil {
		return nil, false, err
	}

	var descVal sql.NullString
	if req.Description != "" {
		descVal = sql.NullString{String: req.Description, Valid: true}
	}

	created, createErr := s.store.CreateIssue(ctx, db.CreateIssueParams{
		ClientUuid:   req.ClientUUID,
		CreatorID:    currentUser.ID,
		Category:     req.Category,
		LocationCode: req.LocationCode,
		Description:  descVal,
		PhotoBefore:  beforeBasename,
		PhotoDetail:  detailBasename,
	})
	if createErr != nil {
		return nil, false, fmt.Errorf("failed to create issue: %w", createErr)
	}

	s.insertTags(ctx, created.ID, req.Tags)
	s.queueNotification(ctx, created.ID, "NEW_ISSUE", req.Category, req.LocationCode, currentUser.FullName)
	s.recordSyncPenalty(ctx, created.ID, req.Category, req.LocationCode)

	resp, getErr := s.GetIssueByID(ctx, created.ID)
	if getErr == nil {
		s.broadcast(Event{Type: EventIssueCreated, IssueID: created.ID})
	}
	return resp, true, getErr
}

func (s *ServiceImpl) saveSyncPhotos(req SyncIssueRequest) (string, sql.NullString, error) {
	if !isValidCategory(req.Category) {
		return "", sql.NullString{}, ErrInvalidCategory
	}
	if req.PhotoBefore == nil {
		return "", sql.NullString{}, storage.ErrEmptyFile
	}

	beforeBasename, saveErr := s.storageManager.SaveBeforePhoto(req.PhotoBefore, req.ClientUUID)
	if saveErr != nil {
		return "", sql.NullString{}, saveErr
	}

	var detailBasename sql.NullString
	if req.PhotoDetail != nil {
		dName, dErr := s.storageManager.SaveDetailPhoto(req.PhotoDetail, req.ClientUUID)
		if dErr != nil {
			return "", sql.NullString{}, dErr
		}
		detailBasename = sql.NullString{String: dName, Valid: true}
	}

	return beforeBasename, detailBasename, nil
}

func (s *ServiceImpl) insertTags(ctx context.Context, issueID int64, tags []string) {
	for _, tagCode := range tags {
		if tagCode != "" {
			if insErr := s.store.InsertIssueTag(ctx, db.InsertIssueTagParams{IssueID: issueID, TagCode: tagCode}); insErr != nil {
				log.Printf("failed to insert tag: %v", insErr)
			}
			if incErr := s.store.IncrementTagUseCount(ctx, tagCode); incErr != nil {
				log.Printf("failed to increment tag count: %v", incErr)
			}
		}
	}
}

func (s *ServiceImpl) recordSyncPenalty(ctx context.Context, issueID int64, category, locationCode string) {
	penaltyKey := "penalty_normal"
	points := int32(-2)
	if category == Category6S.String() {
		penaltyKey = "penalty_safety"
		points = int32(-10)
	}
	if scErr := s.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
		IssueID:    issueID,
		TargetType: "LOCATION",
		TargetID:   locationCode,
		RuleKey:    penaltyKey,
		Points:     points,
	}); scErr != nil {
		log.Printf("failed to log penalty score: %v", scErr)
	}
}

func (s *ServiceImpl) queueNotification(ctx context.Context, issueID int64, eventType, category, locCode, reporterName string) {
	payload, err := json.Marshal(map[string]any{
		"issue_id":      issueID,
		"event_type":    eventType,
		"category":      category,
		"location_code": locCode,
		"reporter_name": reporterName,
	})
	if err != nil {
		log.Printf("failed to marshal notification: %v", err)
		return
	}

	if _, err := s.store.CreateOutboxEntry(ctx, db.CreateOutboxEntryParams{
		IssueID:   issueID,
		EventType: eventType,
		Channel:   "WXPUSHER",
		Payload:   payload,
	}); err != nil {
		log.Printf("failed to queue wxpusher outbox: %v", err)
	}

	if _, err := s.store.CreateOutboxEntry(ctx, db.CreateOutboxEntryParams{
		IssueID:   issueID,
		EventType: eventType,
		Channel:   "LAN_WEBHOOK",
		Payload:   payload,
	}); err != nil {
		log.Printf("failed to queue lan webhook outbox: %v", err)
	}

	if s.notifyCh != nil {
		select {
		case s.notifyCh <- struct{}{}:
		default:
		}
	}
}

// ResolveIssueRequest parameters for POST /api/issues/{id}/resolve.
type ResolveIssueRequest struct {
	IssueID            int64
	ResolvedClientUUID string
	ExpectedVersion    int32
	Force              bool
	PhotoAfter         *multipart.FileHeader
}

// ResolveIssue handles resolving an open issue with after photo.
func (s *ServiceImpl) ResolveIssue(ctx context.Context, req ResolveIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if issue.Status != StatusOpen.String() {
		return nil, fmt.Errorf("%w: current status %s", ErrIssueConflict, issue.Status)
	}

	if req.PhotoAfter == nil {
		return nil, storage.ErrEmptyFile
	}

	afterBasename, err := s.storageManager.SaveAfterPhoto(req.PhotoAfter, req.ResolvedClientUUID)
	if err != nil {
		return nil, err
	}

	var updated db.Issue
	if req.Force {
		updated, err = s.store.ForceResolveIssue(ctx, db.ForceResolveIssueParams{
			ID:         issue.ID,
			ResolverID: sql.NullInt64{Int64: currentUser.ID, Valid: true},
			PhotoAfter: sql.NullString{String: afterBasename, Valid: true},
		})
	} else {
		updated, err = s.store.ResolveIssue(ctx, db.ResolveIssueParams{
			ID:         issue.ID,
			ResolverID: sql.NullInt64{Int64: currentUser.ID, Valid: true},
			PhotoAfter: sql.NullString{String: afterBasename, Valid: true},
			Version:    req.ExpectedVersion,
		})
	}
	if err != nil {
		return nil, fmt.Errorf("%w: failed to resolve issue: %v", ErrIssueConflict, err)
	}

	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(Event{Type: EventIssueResolved, IssueID: updated.ID})
	}
	return res, err
}

// CloseIssueRequest parameters for POST /api/issues/{id}/close.
type CloseIssueRequest struct {
	IssueID         int64
	ScoreRating     int16
	ExpectedVersion *int32
}

// CloseIssue handles closing and scoring a resolved issue.
func (s *ServiceImpl) canCloseIssue(currentUser db.User, issue db.Issue) bool {
	if issue.Category == Category6S.String() {
		return currentUser.Role == auth.RoleSafetyOfficer.String() || currentUser.Role == auth.RoleAdmin.String()
	}
	isCreator := (currentUser.ID == issue.CreatorID)
	isPrivileged := (currentUser.Role == auth.RoleAdmin.String() || currentUser.Role == auth.RoleSafetyOfficer.String())
	return isCreator || isPrivileged
}

// CloseIssue handles closing and scoring a resolved issue.
func (s *ServiceImpl) CloseIssue(ctx context.Context, req CloseIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if issue.Status != StatusPendingReview.String() {
		return nil, fmt.Errorf("%w: issue must be PENDING_REVIEW", ErrIssueConflict)
	}

	if !s.canCloseIssue(currentUser, issue) {
		return nil, ErrPermissionDenied
	}

	rating := req.ScoreRating
	if rating < 1 || rating > 5 {
		rating = 3
	}

	var expectedV sql.NullInt32
	if req.ExpectedVersion != nil {
		expectedV = sql.NullInt32{Int32: *req.ExpectedVersion, Valid: true}
	}

	updated, err := s.store.CloseIssue(ctx, db.CloseIssueParams{
		ID:              issue.ID,
		ScoreRating:     sql.NullInt16{Int16: rating, Valid: true},
		ExpectedVersion: expectedV,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: failed to close issue: %v", ErrIssueConflict, err)
	}

	s.recordCloseReward(ctx, issue, rating)
	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(Event{Type: EventIssueClosed, IssueID: updated.ID})
	}
	return res, err
}

func (s *ServiceImpl) recordCloseReward(ctx context.Context, issue db.Issue, rating int16) {
	rewardKey := "reward_reporter_normal"
	rewardPoints := int32(2)
	if issue.Category == Category6S.String() {
		rewardKey = "reward_reporter_safety"
		rewardPoints = int32(5)
	}
	if scErr := s.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
		IssueID:    issue.ID,
		TargetType: "USER",
		TargetID:   strconv.FormatInt(issue.CreatorID, 10),
		RuleKey:    rewardKey,
		Points:     rewardPoints,
	}); scErr != nil {
		log.Printf("failed to insert reward score: %v", scErr)
	}

	if rating >= 4 {
		if bcErr := s.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
			IssueID:    issue.ID,
			TargetType: "LOCATION",
			TargetID:   issue.LocationCode,
			RuleKey:    "bonus_kaizen",
			Points:     int32(1),
		}); bcErr != nil {
			log.Printf("failed to insert kaizen bonus: %v", bcErr)
		}
	}
}

// ReopenIssueRequest parameters for POST /api/issues/{id}/reopen.
type ReopenIssueRequest struct {
	IssueID         int64
	RejectReason    string
	ExpectedVersion *int32
}

// ReopenIssue handles rejecting review and reopening issue.
func (s *ServiceImpl) ReopenIssue(ctx context.Context, req ReopenIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if issue.Status != StatusPendingReview.String() {
		return nil, fmt.Errorf("%w: issue must be PENDING_REVIEW", ErrIssueConflict)
	}

	isCreator := (currentUser.ID == issue.CreatorID)
	isPrivileged := (currentUser.Role == auth.RoleAdmin.String() || currentUser.Role == auth.RoleSafetyOfficer.String())
	if !isCreator && !isPrivileged {
		return nil, ErrPermissionDenied
	}

	var expectedV sql.NullInt32
	if req.ExpectedVersion != nil {
		expectedV = sql.NullInt32{Int32: *req.ExpectedVersion, Valid: true}
	}

	updated, err := s.store.ReopenIssue(ctx, db.ReopenIssueParams{
		ID:              issue.ID,
		RejectReason:    sql.NullString{String: req.RejectReason, Valid: req.RejectReason != ""},
		ExpectedVersion: expectedV,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: failed to reopen: %v", ErrIssueConflict, err)
	}

	if scErr := s.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
		IssueID:    issue.ID,
		TargetType: "LOCATION",
		TargetID:   issue.LocationCode,
		RuleKey:    "penalty_reopen",
		Points:     -2,
	}); scErr != nil {
		log.Printf("failed to insert reopen penalty: %v", scErr)
	}

	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(Event{Type: EventIssueReopened, IssueID: updated.ID})
	}
	return res, err
}

// InvalidateIssueRequest parameters for POST /api/issues/{id}/invalid.
type InvalidateIssueRequest struct {
	IssueID         int64
	Reason          string
	ExpectedVersion *int32
}

// InvalidateIssue handles discarding invalid issues.
func (s *ServiceImpl) InvalidateIssue(ctx context.Context, req InvalidateIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}

	if currentUser.Role != auth.RoleAdmin.String() && currentUser.Role != auth.RoleSafetyOfficer.String() {
		return nil, ErrPermissionDenied
	}

	if issue.Status != StatusOpen.String() && issue.Status != StatusPendingReview.String() {
		return nil, fmt.Errorf("%w: cannot invalidate closed or invalid issue", ErrIssueConflict)
	}

	var expectedV sql.NullInt32
	if req.ExpectedVersion != nil {
		expectedV = sql.NullInt32{Int32: *req.ExpectedVersion, Valid: true}
	}

	updated, err := s.store.InvalidateIssue(ctx, db.InvalidateIssueParams{
		ID:              issue.ID,
		RejectReason:    sql.NullString{String: req.Reason, Valid: req.Reason != ""},
		ExpectedVersion: expectedV,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: failed to invalidate: %v", ErrIssueConflict, err)
	}

	if scErr := s.store.InsertScoreLog(ctx, db.InsertScoreLogParams{
		IssueID:    issue.ID,
		TargetType: "USER",
		TargetID:   strconv.FormatInt(issue.CreatorID, 10),
		RuleKey:    "penalty_reporter_invalid",
		Points:     -2,
	}); scErr != nil {
		log.Printf("failed to insert invalid penalty: %v", scErr)
	}

	oldVal, oErr := json.Marshal(map[string]string{"status": issue.Status})
	if oErr != nil {
		log.Printf("marshal oldVal failed: %v", oErr)
	}
	newVal, nErr := json.Marshal(map[string]string{"status": "INVALID"})
	if nErr != nil {
		log.Printf("marshal newVal failed: %v", nErr)
	}
	if alErr := s.store.InsertAuditLog(ctx, db.InsertAuditLogParams{
		UserID:      sql.NullInt64{Int64: currentUser.ID, Valid: true},
		Action:      "INVALIDATE_ISSUE",
		TargetTable: "issues",
		TargetID:    strconv.FormatInt(issue.ID, 10),
		OldValue:    oldVal,
		NewValue:    newVal,
		IpAddress:   sql.NullString{},
		UserAgent:   sql.NullString{},
	}); alErr != nil {
		log.Printf("failed to log audit for invalidate: %v", alErr)
	}

	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(Event{Type: EventIssueInvalidated, IssueID: updated.ID})
	}
	return res, err
}

// PatchIssueRequest parameters for PATCH /api/issues/{id}.
type PatchIssueRequest struct {
	IssueID      int64
	Category     *string
	LocationCode *string
	Tags         []string
}

func (s *ServiceImpl) canPatchIssue(currentUser db.User, issue db.Issue) bool {
	isCreator := (currentUser.ID == issue.CreatorID)
	isResolver := (issue.ResolverID.Valid && currentUser.ID == issue.ResolverID.Int64)
	isPrivileged := (currentUser.Role == auth.RoleAdmin.String() || currentUser.Role == auth.RoleSafetyOfficer.String())
	return isCreator || isResolver || isPrivileged
}

// PatchIssue handles quick edit of category and tags.
func (s *ServiceImpl) parsePatchParams(req PatchIssueRequest, issue db.Issue) (sql.NullString, sql.NullString, bool, error) {
	var catVal sql.NullString
	escalatedToSafety := false
	if req.Category != nil && *req.Category != "" {
		if !isValidCategory(*req.Category) {
			return catVal, sql.NullString{}, false, ErrInvalidCategory
		}
		catVal = sql.NullString{String: *req.Category, Valid: true}
		if *req.Category == Category6S.String() && issue.Category != Category6S.String() {
			escalatedToSafety = true
		}
	}

	var locVal sql.NullString
	if req.LocationCode != nil && *req.LocationCode != "" {
		locVal = sql.NullString{String: *req.LocationCode, Valid: true}
	}
	return catVal, locVal, escalatedToSafety, nil
}

// PatchIssue handles quick edit of category and tags.
func (s *ServiceImpl) PatchIssue(ctx context.Context, req PatchIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if !s.canPatchIssue(currentUser, issue) {
		return nil, ErrPermissionDenied
	}

	catVal, locVal, escalatedToSafety, parseErr := s.parsePatchParams(req, issue)
	if parseErr != nil {
		return nil, parseErr
	}

	updated, patchErr := s.store.PatchIssue(ctx, db.PatchIssueParams{
		ID:           issue.ID,
		Category:     catVal,
		LocationCode: locVal,
	})
	if patchErr != nil {
		return nil, fmt.Errorf("failed to patch issue: %w", patchErr)
	}

	if len(req.Tags) > 0 {
		if delErr := s.store.DeleteIssueTags(ctx, issue.ID); delErr != nil {
			log.Printf("failed to delete issue tags: %v", delErr)
		}
		for _, t := range req.Tags {
			if t != "" {
				if insErr := s.store.InsertIssueTag(ctx, db.InsertIssueTagParams{IssueID: issue.ID, TagCode: t}); insErr != nil {
					log.Printf("failed to insert tag: %v", insErr)
				}
			}
		}
	}

	if escalatedToSafety {
		s.queueNotification(ctx, issue.ID, "SAFETY_ESCALATED", "6S", updated.LocationCode, currentUser.FullName)
	}

	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(Event{Type: EventIssueUpdated, IssueID: updated.ID})
	}
	return res, err
}

// GetIssueByID retrieves detailed issue response with tags and creator.
func (s *ServiceImpl) GetIssueByID(ctx context.Context, id int64) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, id)
	if err != nil {
		return nil, ErrIssueNotFound
	}

	loc, locErr := s.store.GetLocationByCode(ctx, issue.LocationCode)
	if locErr != nil {
		log.Printf("location not found: %v", locErr)
	}

	creator, crErr := s.store.GetUserByID(ctx, issue.CreatorID)
	if crErr != nil {
		log.Printf("creator user not found: %v", crErr)
	}

	var resolver *UserItem
	if issue.ResolverID.Valid {
		if resUser, resErr := s.store.GetUserByID(ctx, issue.ResolverID.Int64); resErr == nil {
			resolver = &UserItem{
				ID:       resUser.ID,
				Username: resUser.Username,
				FullName: resUser.FullName,
			}
		}
	}

	tagRows, tagErr := s.store.ListTagsForIssue(ctx, issue.ID)
	if tagErr != nil {
		log.Printf("list tags for issue failed: %v", tagErr)
	}
	tags := make([]string, 0, len(tagRows))
	for _, t := range tagRows {
		tags = append(tags, t.Code)
	}

	return toIssueResponse(issue, loc.NameVi, tags, creator, resolver), nil
}

// ListIssuesFiltered lists issues with filter criteria.
func (s *ServiceImpl) ListIssuesFiltered(ctx context.Context, status, category, locationCode string, page, limit int) ([]Response, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var statusParam, catParam, locParam sql.NullString
	if status != "" {
		statusParam = sql.NullString{String: status, Valid: true}
	}
	if category != "" {
		catParam = sql.NullString{String: category, Valid: true}
	}
	if locationCode != "" {
		locParam = sql.NullString{String: locationCode, Valid: true}
	}

	rows, err := s.store.ListIssuesFiltered(ctx, db.ListIssuesFilteredParams{
		Status:       statusParam,
		Category:     catParam,
		LocationCode: locParam,
		Limit:        int32(limit),  //nolint:gosec
		Offset:       int32(offset), //nolint:gosec
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list issues failed: %w", err)
	}

	total, err := s.store.CountIssuesFiltered(ctx, db.CountIssuesFilteredParams{
		Status:       statusParam,
		Category:     catParam,
		LocationCode: locParam,
	})
	if err != nil {
		total = int64(len(rows))
	}

	items := make([]Response, 0, len(rows))
	for _, r := range rows {
		issue := db.Issue{
			ID:           r.ID,
			ClientUuid:   r.ClientUuid,
			Version:      r.Version,
			CreatorID:    r.CreatorID,
			ResolverID:   r.ResolverID,
			Category:     r.Category,
			LocationCode: r.LocationCode,
			Description:  r.Description,
			RejectReason: r.RejectReason,
			PhotoBefore:  r.PhotoBefore,
			PhotoDetail:  r.PhotoDetail,
			PhotoAfter:   r.PhotoAfter,
			ScoreRating:  r.ScoreRating,
			Status:       r.Status,
			CreatedAt:    r.CreatedAt,
			ResolvedAt:   r.ResolvedAt,
			ClosedAt:     r.ClosedAt,
		}
		creator := db.User{
			ID:       r.CreatorID,
			Username: r.CreatorUsername,
			FullName: r.CreatorFullName,
		}
		var resolver *UserItem
		if r.ResolverID.Valid {
			resolver = &UserItem{
				ID:       r.ResolverID.Int64,
				Username: r.ResolverUsername.String,
				FullName: r.ResolverFullName.String,
			}
		}

		tagRows, tErr := s.store.ListTagsForIssue(ctx, r.ID)
		if tErr != nil {
			log.Printf("failed to list tags: %v", tErr)
		}
		tags := make([]string, 0, len(tagRows))
		for _, tr := range tagRows {
			tags = append(tags, tr.Code)
		}

		items = append(items, *toIssueResponse(issue, r.LocationNameVi, tags, creator, resolver))
	}

	return items, total, nil
}

func toIssueResponse(issue db.Issue, locName string, tags []string, creator db.User, resolver *UserItem) *Response {
	resp := &Response{
		ID:           issue.ID,
		ClientUUID:   issue.ClientUuid,
		Version:      issue.Version,
		Category:     issue.Category,
		LocationCode: issue.LocationCode,
		LocationName: locName,
		Tags:         tags,
		Status:       issue.Status,
		Creator: UserItem{
			ID:       creator.ID,
			Username: creator.Username,
			FullName: creator.FullName,
		},
		Resolver:  resolver,
		CreatedAt: issue.CreatedAt.Format(time.RFC3339),
	}

	if issue.Description.Valid {
		resp.Description = &issue.Description.String
	}
	if issue.RejectReason.Valid {
		resp.RejectReason = &issue.RejectReason.String
	}
	if issue.PhotoDetail.Valid && issue.PhotoDetail.String != "" {
		pDetail := formatPhotoURL("detail", issue.PhotoDetail.String)
		resp.PhotoDetail = &pDetail
	}
	if issue.PhotoAfter.Valid && issue.PhotoAfter.String != "" {
		pAfter := formatPhotoURL("after", issue.PhotoAfter.String)
		resp.PhotoAfter = &pAfter
	}
	if issue.ScoreRating.Valid {
		resp.ScoreRating = issue.ScoreRating.Int16
	}
	if issue.ResolvedAt.Valid {
		tStr := issue.ResolvedAt.Time.Format(time.RFC3339)
		resp.ResolvedAt = &tStr
	}
	if issue.ClosedAt.Valid {
		tStr := issue.ClosedAt.Time.Format(time.RFC3339)
		resp.ClosedAt = &tStr
	}
	resp.PhotoBefore = formatPhotoURL("before", issue.PhotoBefore)

	return resp
}

func formatPhotoURL(folder, filename string) string {
	if filename == "" {
		return ""
	}
	if strings.HasPrefix(filename, "/") || strings.HasPrefix(filename, "data:") {
		return filename
	}
	return fmt.Sprintf("/uploads/%s/%s", folder, filename)
}

func isValidCategory(c string) bool {
	return Category(c).IsValid()
}
