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
)

// SyncIssueRequest parameters for POST /api/issues/sync.
type SyncIssueRequest struct {
	ClientUUID   string
	Category     string
	CauseType    string
	LocationCode string
	Tags         []string
	Description  string
	PhotoBefore  *multipart.FileHeader
	PhotoDetail  *multipart.FileHeader
}

// SyncIssue handles creating or idempotently returning an issue.

// SyncIssue handles creating or idempotently returning an issue.
func (s *ServiceImpl) SyncIssue(ctx context.Context, req SyncIssueRequest, currentUser db.User) (*Response, bool, error) {
	existing, err := s.store.GetIssueByUUID(ctx, req.ClientUUID)
	if err == nil {
		resp, gErr := s.GetIssueByID(ctx, existing.ID)
		return resp, false, gErr
	}

	atomicStore, ok := s.store.(Atomic)
	if !ok {
		return nil, false, errors.New("issue store does not support atomic creation")
	}
	beforeBasename, detailBasename, err := s.saveSyncPhotos(req)
	if err != nil {
		return nil, false, err
	}
	cleanup := func() {
		if err := s.storageManager.RemovePhoto("before", beforeBasename); err != nil {
			log.Printf("failed to remove issue photo after create failure: %v", err)
		}
		if detailBasename.Valid {
			if err := s.storageManager.RemovePhoto("detail", detailBasename.String); err != nil {
				log.Printf("failed to remove issue detail photo after create failure: %v", err)
			}
		}
	}
	var descVal sql.NullString
	if req.Description != "" {
		descVal = sql.NullString{String: req.Description, Valid: true}
	}
	penaltyKey, fallback := "penalty_normal", int32(-2)
	if req.Category == Category6S.String() {
		penaltyKey, fallback = "penalty_safety", -10
	}
	score := db.InsertScoreLogParams{TargetType: "LOCATION", TargetID: req.LocationCode, RuleKey: penaltyKey, Points: fallback}
	if rule, ruleErr := s.store.GetScoringRuleByKey(ctx, penaltyKey); ruleErr == nil {
		if rule.Points >= 0 {
			cleanup()
			return nil, false, fmt.Errorf("invalid scoring rule %s", penaltyKey)
		}
		score.Points = rule.Points
	} else if !errors.Is(ruleErr, sql.ErrNoRows) {
		cleanup()
		return nil, false, fmt.Errorf("load scoring rule: %w", ruleErr)
	}
	buildOutbox := func(issueID int64) []db.CreateOutboxEntryParams {
		return buildOutboxEntries(issueID, "NEW_ISSUE", req.Category, req.LocationCode, currentUser.FullName)
	}
	created, createErr := atomicStore.CreateIssueWithSideEffects(ctx, db.CreateIssueParams{
		ClientUuid: req.ClientUUID, SiteID: currentUser.SiteID, CreatorID: currentUser.ID,
		Category: req.Category, CauseType: NormalizeCauseType(req.CauseType, req.Category), VisibilityClass: visibilityForCategory(req.Category),
		LocationCode: req.LocationCode, Description: descVal, PhotoBefore: beforeBasename, PhotoDetail: detailBasename,
	}, req.Tags, buildOutbox, func(issueID int64) []db.InsertScoreLogParams {
		score.IssueID = issueID
		return []db.InsertScoreLogParams{score}
	})
	if createErr != nil {
		cleanup()
		return nil, false, fmt.Errorf("failed to create issue: %w", createErr)
	}
	if s.notifyCh != nil {
		select {
		case s.notifyCh <- struct{}{}:
		default:
		}
	}
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

// recordConfiguredScore awards a score from the admin-configured rule; a missing
// rule falls back to the safe default and a sign-violating rule awards nothing.

// ResolveIssueRequest parameters for POST /api/issues/{id}/resolve.
type ResolveIssueRequest struct {
	IssueID            int64
	ResolvedClientUUID string
	ExpectedVersion    int32
	Force              bool
	PhotoAfter         *multipart.FileHeader
}

// ResolveIssue handles resolving an open issue with after photo.

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
	atomicStore, ok := s.store.(Atomic)
	if !ok {
		_ = s.storageManager.RemovePhoto("after", afterBasename)
		return nil, errors.New("issue store does not support atomic resolution")
	}
	var updated db.Issue
	if req.Force {
		updated, err = atomicStore.ResolveIssueAtomic(ctx, true, db.ResolveIssueParams{}, db.ForceResolveIssueParams{ID: issue.ID, ResolverID: sql.NullInt64{Int64: currentUser.ID, Valid: true}, PhotoAfter: sql.NullString{String: afterBasename, Valid: true}})
	} else {
		updated, err = atomicStore.ResolveIssueAtomic(ctx, false, db.ResolveIssueParams{ID: issue.ID, ResolverID: sql.NullInt64{Int64: currentUser.ID, Valid: true}, PhotoAfter: sql.NullString{String: afterBasename, Valid: true}, Version: req.ExpectedVersion}, db.ForceResolveIssueParams{})
	}
	if err != nil {
		if cleanupErr := s.storageManager.RemovePhoto("after", afterBasename); cleanupErr != nil {
			log.Printf("failed to remove issue after photo after resolution failure: %v", cleanupErr)
		}
		return nil, fmt.Errorf("%w: failed to resolve issue: %v", ErrIssueConflict, err)
	}
	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(Event{Type: EventIssueResolved, IssueID: updated.ID})
	}
	return res, err
}

// CloseIssueRequest parameters for POST /api/issues/{id}/close.

// CloseIssueRequest parameters for POST /api/issues/{id}/close.
type CloseIssueRequest struct {
	IssueID         int64
	ScoreRating     int16
	ExpectedVersion *int32
}

// canCloseIssue applies permission scope plus creator/location/category constraints.

// canCloseIssue applies permission scope plus creator/location/category constraints.
func (s *ServiceImpl) canCloseIssue(ctx context.Context, currentUser db.User, issue db.Issue) bool {
	if issue.Category == Category6S.String() {
		return auth.HasPermission(ctx, auth.PermissionIssueCloseSafety)
	}
	if auth.HasPermission(ctx, auth.PermissionIssueCloseAny) {
		return true
	}
	if currentUser.ID == issue.CreatorID && auth.HasPermission(ctx, auth.PermissionIssueCloseOwn) {
		return true
	}
	scope, err := auth.LocationScope(ctx, s.store, currentUser)
	if err != nil {
		return false
	}
	return auth.HasPermission(ctx, auth.PermissionIssueCloseLine) && scope.CanAccessLocation(issue.LocationCode)
}

func (s *ServiceImpl) canReviewIssue(ctx context.Context, currentUser db.User, issue db.Issue) bool {
	return auth.HasPermission(ctx, auth.PermissionIssueReopen) && s.canCloseIssue(ctx, currentUser, issue)
}

// CloseIssue handles closing and scoring a resolved issue.

// CloseIssue handles closing and scoring a resolved issue.
func (s *ServiceImpl) CloseIssue(ctx context.Context, req CloseIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if issue.Status != StatusPendingReview.String() {
		return nil, fmt.Errorf("%w: issue must be PENDING_REVIEW", ErrIssueConflict)
	}

	if !s.canCloseIssue(ctx, currentUser, issue) {
		return nil, ErrPermissionDenied
	}

	rating := req.ScoreRating
	if rating < 1 || rating > 5 {
		rating = 3
	}

	expectedV := expectedVersion(req.ExpectedVersion)

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

// ReopenIssueRequest parameters for POST /api/issues/{id}/reopen.
type ReopenIssueRequest struct {
	IssueID         int64
	RejectReason    string
	ExpectedVersion *int32
}

// ReopenIssue handles rejecting review and reopening issue.

// ReopenIssue handles rejecting review and reopening issue.
func (s *ServiceImpl) ReopenIssue(ctx context.Context, req ReopenIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if issue.Status != StatusPendingReview.String() {
		return nil, fmt.Errorf("%w: issue must be PENDING_REVIEW", ErrIssueConflict)
	}
	if !s.canReviewIssue(ctx, currentUser, issue) {
		return nil, ErrPermissionDenied
	}

	expectedV := expectedVersion(req.ExpectedVersion)

	updated, err := s.store.ReopenIssue(ctx, db.ReopenIssueParams{
		ID:              issue.ID,
		RejectReason:    sql.NullString{String: req.RejectReason, Valid: req.RejectReason != ""},
		ExpectedVersion: expectedV,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: failed to reopen: %v", ErrIssueConflict, err)
	}

	s.recordConfiguredScore(ctx, issue.ID, "LOCATION", issue.LocationCode, "penalty_reopen", int32(-2), false)

	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(Event{Type: EventIssueReopened, IssueID: updated.ID})
	}
	return res, err
}

// InvalidateIssueRequest parameters for POST /api/issues/{id}/invalid.

// InvalidateIssueRequest parameters for POST /api/issues/{id}/invalid.
type InvalidateIssueRequest struct {
	IssueID         int64
	Reason          string
	ExpectedVersion *int32
}

// InvalidateIssue handles discarding invalid issues.

// InvalidateIssue handles discarding invalid issues.
func (s *ServiceImpl) InvalidateIssue(ctx context.Context, req InvalidateIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}

	if !auth.HasPermission(ctx, auth.PermissionIssueInvalidate) {
		return nil, ErrPermissionDenied
	}

	if issue.Status != StatusOpen.String() && issue.Status != StatusPendingReview.String() {
		return nil, fmt.Errorf("%w: cannot invalidate closed or invalid issue", ErrIssueConflict)
	}

	expectedV := expectedVersion(req.ExpectedVersion)

	updated, err := s.store.InvalidateIssue(ctx, db.InvalidateIssueParams{
		ID:              issue.ID,
		RejectReason:    sql.NullString{String: req.Reason, Valid: req.Reason != ""},
		ExpectedVersion: expectedV,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: failed to invalidate: %v", ErrIssueConflict, err)
	}

	oldVal, oErr := json.Marshal(map[string]string{"status": issue.Status})
	if oErr != nil {
		log.Printf("marshal oldVal failed: %v", oErr)
	}
	newVal, nErr := json.Marshal(map[string]string{"status": "INVALID"})
	if nErr != nil {
		log.Printf("marshal newVal failed: %v", nErr)
	}
	s.recordConfiguredScore(ctx, issue.ID, "USER", strconv.FormatInt(issue.CreatorID, 10), "penalty_reporter_invalid", int32(-5), false)
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

// PatchIssueRequest parameters for PATCH /api/issues/{id}.
type PatchIssueRequest struct {
	IssueID      int64
	Category     *string
	CauseType    *string
	LocationCode *string
	Description  *string
	Tags         []string
	PhotoBefore  *multipart.FileHeader
	PhotoDetail  *multipart.FileHeader
}

func canPatchIssue(ctx context.Context, currentUser db.User, issue db.Issue) bool {
	if (currentUser.ID == issue.CreatorID || (issue.ResolverID.Valid && currentUser.ID == issue.ResolverID.Int64)) && auth.HasPermission(ctx, auth.PermissionIssueCloseOwn) {
		return true
	}
	return auth.HasPermission(ctx, auth.PermissionIssueCloseAny)
}

// PatchIssue handles quick or full edit of an issue.

// PatchIssue handles quick or full edit of an issue.
func (s *ServiceImpl) parsePatchParams(req PatchIssueRequest, issue db.Issue) (sql.NullString, sql.NullString, sql.NullString, sql.NullString, sql.NullString, sql.NullString, bool, error) {
	var catVal sql.NullString
	var causeVal sql.NullString
	escalatedToSafety := false
	if req.Category != nil && *req.Category != "" {
		if !isValidCategory(*req.Category) {
			return catVal, causeVal, sql.NullString{}, sql.NullString{}, sql.NullString{}, sql.NullString{}, false, ErrInvalidCategory
		}
		catVal = sql.NullString{String: *req.Category, Valid: true}
		if *req.Category == Category6S.String() && issue.Category != Category6S.String() {
			escalatedToSafety = true
		}
	}

	if req.CauseType != nil && *req.CauseType != "" {
		causeVal = sql.NullString{String: *req.CauseType, Valid: true}
	}
	var locVal sql.NullString
	if req.LocationCode != nil && *req.LocationCode != "" {
		locVal = sql.NullString{String: *req.LocationCode, Valid: true}
	}

	var descVal sql.NullString
	if req.Description != nil {
		descVal = sql.NullString{String: *req.Description, Valid: true}
	}

	var beforeVal sql.NullString
	if req.PhotoBefore != nil {
		bName, bErr := s.storageManager.SaveBeforePhoto(req.PhotoBefore, issue.ClientUuid)
		if bErr != nil {
			return catVal, causeVal, locVal, descVal, beforeVal, sql.NullString{}, false, bErr
		}
		beforeVal = sql.NullString{String: bName, Valid: true}
	}

	var detailVal sql.NullString
	if req.PhotoDetail != nil {
		dName, dErr := s.storageManager.SaveDetailPhoto(req.PhotoDetail, issue.ClientUuid)
		if dErr != nil {
			return catVal, causeVal, locVal, descVal, beforeVal, detailVal, false, dErr
		}
		detailVal = sql.NullString{String: dName, Valid: true}
	}

	return catVal, causeVal, locVal, descVal, beforeVal, detailVal, escalatedToSafety, nil
}

// PatchIssue handles edit of issue properties.

// PatchIssue handles edit of issue properties.
func (s *ServiceImpl) PatchIssue(ctx context.Context, req PatchIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if !canPatchIssue(ctx, currentUser, issue) {
		return nil, ErrPermissionDenied
	}

	catVal, causeVal, locVal, descVal, beforeVal, detailVal, escalatedToSafety, parseErr := s.parsePatchParams(req, issue)
	if parseErr != nil {
		return nil, parseErr
	}

	patch := db.PatchIssueParams{
		ID:           issue.ID,
		Category:     catVal,
		CauseType:    causeVal,
		LocationCode: locVal,
		Description:  descVal,
		PhotoBefore:  beforeVal,
		PhotoDetail:  detailVal,
	}
	var updated db.Issue
	if len(req.Tags) > 0 {
		updated, err = s.store.PatchIssueWithTagsAtomic(ctx, patch, req.Tags)
	} else {
		updated, err = s.store.PatchIssue(ctx, patch)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to patch issue: %w", err)
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
