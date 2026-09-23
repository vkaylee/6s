package issue

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mime/multipart"
	"strconv"
	"strings"
	"time"

	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/storage"
)

// SyncIssueRequest parameters for POST /api/issues/sync.
type SyncIssueRequest struct {
	ClientUUID             string
	Category               string
	CauseType              string
	LocationCode           string
	LocationNameViSnapshot string
	LocationNameZhSnapshot string
	LocationNameEnSnapshot string
	LocationSnapshotSource string
	Tags                   []string
	ProposedTags           []ProposedTag
	Description            string
	AssetID                *int64
	AssignedTeamID         *int64
	AssigneeID             *int64
	PhotoBefore            *multipart.FileHeader
	PhotoDetail            *multipart.FileHeader
}

// ProposedTag is a creator-owned tag awaiting moderation.
type ProposedTag struct {
	NameVi   string `json:"name_vi"`
	NameZh   string `json:"name_zh"`
	NameEn   string `json:"name_en"`
	Category string `json:"category"`
}

// resolveCreateResponsibility validates optional asset/team/assignee references and applies the
// asset default team suggestion. Explicit team or assignee selection requires issue:assign; the
// asset's configured default team is a validated suggestion and needs no extra capability.
func (s *ServiceImpl) resolveCreateResponsibility(ctx context.Context, req SyncIssueRequest, currentUser db.User) (sql.NullInt64, sql.NullInt64, sql.NullInt64, error) {
	assetID := nullInt64(req.AssetID)
	teamID := nullInt64(req.AssignedTeamID)
	if req.AssetID != nil {
		asset, err := s.loadSiteAsset(ctx, currentUser, *req.AssetID)
		if err != nil {
			return assetID, teamID, sql.NullInt64{}, err
		}
		if req.AssignedTeamID != nil && asset.DefaultTeamID.Valid && asset.DefaultTeamID.Int64 != *req.AssignedTeamID {
			return assetID, teamID, sql.NullInt64{}, fmt.Errorf("%w: asset default team does not match requested team", ErrInvalidResponsibility)
		}
		if !teamID.Valid && asset.DefaultTeamID.Valid {
			teamID = asset.DefaultTeamID
		}
	}
	if (req.AssignedTeamID != nil || req.AssigneeID != nil) && !auth.HasPermission(ctx, auth.PermissionIssueAssign) {
		return assetID, teamID, sql.NullInt64{}, ErrPermissionDenied
	}
	if teamID.Valid {
		team, err := s.loadSiteTeam(ctx, currentUser, teamID.Int64)
		if err != nil {
			return assetID, teamID, sql.NullInt64{}, err
		}
		if !team.IsActive {
			return assetID, teamID, sql.NullInt64{}, fmt.Errorf("%w: team is inactive", ErrInvalidResponsibility)
		}
	}
	assigneeID := nullInt64(req.AssigneeID)
	if assigneeID.Valid {
		if _, err := s.loadSiteUser(ctx, currentUser, assigneeID.Int64); err != nil {
			return assetID, teamID, assigneeID, err
		}
		if !teamID.Valid {
			return assetID, teamID, assigneeID, fmt.Errorf("%w: assignee requires an assigned team", ErrInvalidResponsibility)
		}
		if _, err := s.store.GetTeamMembership(ctx, db.GetTeamMembershipParams{TeamID: teamID.Int64, UserID: assigneeID.Int64}); err != nil {
			return assetID, teamID, assigneeID, fmt.Errorf("%w: assignee is not a member of the assigned team", ErrInvalidResponsibility)
		}
	}
	return assetID, teamID, assigneeID, nil
}

// loadSiteAsset loads an asset that belongs to the current user's site.
func (s *ServiceImpl) loadSiteAsset(ctx context.Context, currentUser db.User, id int64) (db.Asset, error) {
	asset, err := s.store.GetAssetByID(ctx, id)
	if err != nil {
		return db.Asset{}, fmt.Errorf("%w: unknown asset", ErrInvalidResponsibility)
	}
	if !asset.IsActive {
		return db.Asset{}, fmt.Errorf("%w: asset is inactive", ErrInvalidResponsibility)
	}
	if currentUser.SiteID != 0 && asset.SiteID != currentUser.SiteID {
		return db.Asset{}, fmt.Errorf("%w: asset belongs to another site", ErrInvalidResponsibility)
	}
	return asset, nil
}

// loadSiteTeam loads a team that belongs to the current user's site.
func (s *ServiceImpl) loadSiteTeam(ctx context.Context, currentUser db.User, id int64) (db.Team, error) {
	team, err := s.store.GetTeamByID(ctx, id)
	if err != nil {
		return db.Team{}, fmt.Errorf("%w: unknown team", ErrInvalidResponsibility)
	}
	if currentUser.SiteID != 0 && team.SiteID != currentUser.SiteID {
		return db.Team{}, fmt.Errorf("%w: team belongs to another site", ErrInvalidResponsibility)
	}
	return team, nil
}

// loadSiteUser loads an active user that belongs to the current user's site.
func (s *ServiceImpl) loadSiteUser(ctx context.Context, currentUser db.User, id int64) (db.User, error) {
	user, err := s.store.GetUserByID(ctx, id)
	if err != nil {
		return db.User{}, fmt.Errorf("%w: unknown assignee", ErrInvalidResponsibility)
	}
	if !user.IsActive {
		return db.User{}, fmt.Errorf("%w: assignee is inactive", ErrInvalidResponsibility)
	}
	if currentUser.SiteID != 0 && user.SiteID != currentUser.SiteID {
		return db.User{}, fmt.Errorf("%w: assignee belongs to another site", ErrInvalidResponsibility)
	}
	return user, nil
}

func normalizeLocationSnapshot(req SyncIssueRequest) (sql.NullString, sql.NullString, sql.NullString, sql.NullString, sql.NullTime) {
	trim := func(value string) sql.NullString {
		value = strings.TrimSpace(value)
		if value == "" || len(value) > 255 {
			return sql.NullString{}
		}
		return sql.NullString{String: value, Valid: true}
	}
	vi := trim(req.LocationNameViSnapshot)
	zh := trim(req.LocationNameZhSnapshot)
	en := trim(req.LocationNameEnSnapshot)
	source := strings.TrimSpace(req.LocationSnapshotSource)
	if source != "CLIENT_CAPTURE" && source != "SERVER_CAPTURE" {
		source = ""
	}
	var recordedAt sql.NullTime
	if vi.Valid || zh.Valid || en.Valid {
		recordedAt = sql.NullTime{Time: time.Now().UTC(), Valid: true}
	}
	if !recordedAt.Valid || source == "" {
		source = ""
	}
	return vi, zh, en, sql.NullString{String: source, Valid: source != ""}, recordedAt
}

const maxProposedTags = 5

// buildProposedTagParams validates creator proposals and derives stable, creator-scoped tag codes.
// Codes are deterministic so a retried sync reuses the same pending tag instead of duplicating it.
func buildProposedTagParams(req SyncIssueRequest, currentUser db.User) ([]db.UpsertProposedTagParams, error) {
	return buildProposedTagParamsForCategory(req.Category, req.ProposedTags, currentUser.ID)
}

func buildProposedTagParamsForCategory(category string, proposals []ProposedTag, userID int64) ([]db.UpsertProposedTagParams, error) {
	if len(proposals) > maxProposedTags {
		return nil, fmt.Errorf("at most %d proposed tags are allowed", maxProposedTags)
	}
	category = strings.TrimSpace(strings.ToUpper(category))
	seen := make(map[string]struct{}, len(proposals))
	params := make([]db.UpsertProposedTagParams, 0, len(proposals))
	for _, proposal := range proposals {
		nameVi := strings.TrimSpace(proposal.NameVi)
		nameZh := strings.TrimSpace(proposal.NameZh)
		nameEn := strings.TrimSpace(proposal.NameEn)
		proposalCategory := strings.TrimSpace(strings.ToUpper(proposal.Category))
		if nameVi == "" || nameZh == "" || nameEn == "" {
			return nil, fmt.Errorf("proposed tag names are required")
		}
		if len([]rune(nameVi)) > 255 || len([]rune(nameZh)) > 255 || len([]rune(nameEn)) > 255 {
			return nil, fmt.Errorf("proposed tag names are too long")
		}
		if !isValidCategory(proposalCategory) || (category != "" && proposalCategory != category) {
			return nil, fmt.Errorf("proposed tag category is invalid")
		}
		key := strings.ToLower(nameVi) + "\x00" + strings.ToLower(nameZh) + "\x00" + strings.ToLower(nameEn) + "\x00" + proposalCategory
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		hash := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", userID, key)))
		params = append(params, db.UpsertProposedTagParams{
			Code: "pending_" + hex.EncodeToString(hash[:])[:40], NameVi: nameVi, NameZh: nameZh,
			NameEn: nameEn, Category: proposalCategory,
			CreatedBy: sql.NullInt64{Int64: userID, Valid: userID > 0},
		})
	}
	return params, nil
}

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
	proposedParams, propErr := buildProposedTagParams(req, currentUser)
	if propErr != nil {
		return nil, false, propErr
	}
	if _, err := s.store.GetLocationByCode(ctx, req.LocationCode); err != nil {
		return nil, false, fmt.Errorf("%w: unknown location", ErrInvalidResponsibility)
	}
	assetID, teamID, assigneeID, respErr := s.resolveCreateResponsibility(ctx, req, currentUser)
	if respErr != nil {
		return nil, false, respErr
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
	locationNameViSnapshot, locationNameZhSnapshot, locationNameEnSnapshot, snapshotSourceVal, snapshotRecordedAt := normalizeLocationSnapshot(req)
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
	issueParams := db.CreateIssueParams{
		ClientUuid: req.ClientUUID, SiteID: currentUser.SiteID, CreatorID: currentUser.ID,
		Category: req.Category, CauseType: NormalizeCauseType(req.CauseType, req.Category), VisibilityClass: visibilityForCategory(req.Category),
		LocationCode: req.LocationCode, Description: descVal, PhotoBefore: beforeBasename, PhotoDetail: detailBasename,
		LocationNameViSnapshot: locationNameViSnapshot, LocationNameZhSnapshot: locationNameZhSnapshot, LocationNameEnSnapshot: locationNameEnSnapshot,
		LocationSnapshotSource: snapshotSourceVal, LocationSnapshotRecordedAt: snapshotRecordedAt,
		AssetID: assetID, AssignedTeamID: teamID, AssigneeID: assigneeID,
	}
	scoreBuilder := func(issueID int64) []db.InsertScoreLogParams {
		score.IssueID = issueID
		return []db.InsertScoreLogParams{score}
	}
	var created db.Issue
	var createErr error
	if len(proposedParams) > 0 {
		propStore, ok := s.store.(ProposedAtomic)
		if !ok {
			cleanup()
			return nil, false, errors.New("issue store does not support proposed tags")
		}
		created, createErr = propStore.CreateIssueWithProposedTags(ctx, issueParams, req.Tags, proposedParams, buildOutbox, scoreBuilder)
	} else {
		created, createErr = atomicStore.CreateIssueWithSideEffects(ctx, issueParams, req.Tags, buildOutbox, scoreBuilder)
	}
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
		s.broadcast(ctx, Event{Type: EventIssueCreated, IssueID: created.ID})
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
	if !s.canResolveIssue(ctx, currentUser, issue) {
		return nil, ErrPermissionDenied
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
		s.broadcast(ctx, Event{Type: EventIssueResolved, IssueID: updated.ID})
	}
	return res, err
}

// CloseIssueRequest parameters for POST /api/issues/{id}/close.
type CloseIssueRequest struct {
	IssueID         int64
	ScoreRating     int16
	ExpectedVersion *int32
}

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
	// Approving one's own fix is never allowed: resolving and approving stay separate duties.
	if issue.ResolverID.Valid && issue.ResolverID.Int64 == currentUser.ID {
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
		s.broadcast(ctx, Event{Type: EventIssueClosed, IssueID: updated.ID})
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
		s.broadcast(ctx, Event{Type: EventIssueReopened, IssueID: updated.ID})
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
		s.broadcast(ctx, Event{Type: EventIssueInvalidated, IssueID: updated.ID})
	}
	return res, err
}

// PatchIssueRequest parameters for PATCH /api/issues/{id}.
// The double pointers distinguish "absent" (nil) from "explicit null" (non-nil pointer to nil),
// so a client can clear a responsibility link on purpose.
type PatchIssueRequest struct {
	IssueID         int64
	Category        *string
	CauseType       *string
	LocationCode    *string
	Description     *string
	Tags            []string
	ProposedTags    []ProposedTag
	PhotoBefore     *multipart.FileHeader
	PhotoDetail     *multipart.FileHeader
	AssetID         **int64
	AssignedTeamID  **int64
	AssigneeID      **int64
	CauseTeamID     **int64
	CauseStatus     **string
	ExpectedVersion *int32
}

// canPatchIssue reports whether the user may modify editable issue fields.
func canPatchIssue(ctx context.Context, currentUser db.User, issue db.Issue) bool {
	if (currentUser.ID == issue.CreatorID || (issue.ResolverID.Valid && currentUser.ID == issue.ResolverID.Int64)) && auth.HasPermission(ctx, auth.PermissionIssueCloseOwn) {
		return true
	}
	return auth.HasPermission(ctx, auth.PermissionIssueCloseAny)
}

// parsePatchParams resolves the editable issue fields and reports a 6S escalation.
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

// PatchIssue handles edit of issue properties with assignment, cause, and concurrency rules.
func (s *ServiceImpl) PatchIssue(ctx context.Context, req PatchIssueRequest, currentUser db.User) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, req.IssueID)
	if err != nil {
		return nil, ErrIssueNotFound
	}
	if !canPatchIssue(ctx, currentUser, issue) {
		return nil, ErrPermissionDenied
	}
	if !hasResponsibilityPatch(req) && req.CauseStatus == nil && req.CauseTeamID == nil {
		if err := s.applyNonResponsibilityPatch(ctx, req, issue, currentUser); err != nil {
			return nil, err
		}
		return s.GetIssueByID(ctx, issue.ID)
	}
	if req.ExpectedVersion == nil {
		return nil, ErrMissingExpectedVersion
	}
	patch, audit, changed, err := s.buildResponsibilityPatch(ctx, req, issue, currentUser)
	if err != nil {
		return nil, err
	}
	if !changed {
		return s.GetIssueByID(ctx, issue.ID)
	}
	updated, err := s.store.PatchIssueWithAuditAtomic(ctx, patch, patchTags(req), audit)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: stale version", ErrIssueConflict)
		}
		return nil, fmt.Errorf("failed to patch issue: %w", err)
	}
	if escalatedToSafety(issue, patch) {
		s.queueNotification(ctx, issue.ID, "SAFETY_ESCALATED", "6S", updated.LocationCode, currentUser.FullName)
	}
	res, err := s.GetIssueByID(ctx, updated.ID)
	if err == nil {
		s.broadcast(ctx, Event{Type: EventIssueUpdated, IssueID: updated.ID})
	}
	return res, err
}

// hasResponsibilityPatch reports whether the request mutates assignment fields.
func hasResponsibilityPatch(req PatchIssueRequest) bool {
	return req.AssetID != nil || req.AssignedTeamID != nil || req.AssigneeID != nil
}

// patchTags returns the replacement tag set, or nil when the request left tags untouched.
func patchTags(req PatchIssueRequest) []string {
	if len(req.Tags) == 0 {
		return nil
	}
	return req.Tags
}

// escalatedToSafety reports whether this patch promotes the issue to the 6S category.
func escalatedToSafety(issue db.Issue, patch db.PatchIssueParams) bool {
	return patch.Category.Valid && patch.Category.String == Category6S.String() && issue.Category != Category6S.String()
}

// applyNonResponsibilityPatch handles legacy field edits that carry no responsibility semantics.
func (s *ServiceImpl) applyNonResponsibilityPatch(ctx context.Context, req PatchIssueRequest, issue db.Issue, currentUser db.User) error {
	catVal, causeVal, locVal, descVal, beforeVal, detailVal, escalated, parseErr := s.parsePatchParams(req, issue)
	if parseErr != nil {
		return parseErr
	}
	if locVal.Valid {
		if _, err := s.store.GetLocationByCode(ctx, locVal.String); err != nil {
			return fmt.Errorf("%w: unknown location", ErrInvalidResponsibility)
		}
	}
	patch := db.PatchIssueParams{
		ID: issue.ID, Category: catVal, CauseType: causeVal, LocationCode: locVal,
		Description: descVal, PhotoBefore: beforeVal, PhotoDetail: detailVal,
		ExpectedVersion: nullInt32(req.ExpectedVersion),
	}
	var updated db.Issue
	var err error
	targetCategory := issue.Category
	if catVal.Valid && catVal.String != "" {
		targetCategory = catVal.String
	}
	var proposedParams []db.UpsertProposedTagParams
	if len(req.ProposedTags) > 0 {
		ownerID := issue.CreatorID
		if ownerID == 0 {
			ownerID = currentUser.ID
		}
		proposedParams, err = buildProposedTagParamsForCategory(targetCategory, req.ProposedTags, ownerID)
		if err != nil {
			return err
		}
	}
	if len(proposedParams) > 0 {
		if propStore, ok := s.store.(ProposedPatchAtomic); ok {
			updated, err = propStore.PatchIssueWithProposedTagsAtomic(ctx, patch, req.Tags, proposedParams)
		} else {
			return errors.New("issue store does not support atomic proposed tag patch")
		}
	} else if len(req.Tags) > 0 {
		updated, err = s.store.PatchIssueWithTagsAtomic(ctx, patch, req.Tags)
	} else {
		updated, err = s.store.PatchIssue(ctx, patch)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: stale version", ErrIssueConflict)
		}
		return fmt.Errorf("failed to patch issue: %w", err)
	}
	if escalated {
		s.queueNotification(ctx, issue.ID, "SAFETY_ESCALATED", "6S", updated.LocationCode, currentUser.FullName)
	}
	return nil
}

// buildResponsibilityPatch validates assignment and cause changes and produces the atomic write.
func (s *ServiceImpl) buildResponsibilityPatch(ctx context.Context, req PatchIssueRequest, issue db.Issue, currentUser db.User) (db.PatchIssueParams, []db.InsertAuditLogParams, bool, error) {
	patch := db.PatchIssueParams{
		ID: issue.ID, ExpectedVersion: nullInt32(req.ExpectedVersion),
	}
	before := responsibilitySnapshot(issue)
	if hasResponsibilityPatch(req) {
		if !auth.HasPermission(ctx, auth.PermissionIssueAssign) {
			return patch, nil, false, ErrPermissionDenied
		}
		if err := s.applyAssignmentPatch(ctx, req, currentUser, &patch); err != nil {
			return patch, nil, false, err
		}
	}
	if err := s.applyCausePatch(ctx, req, issue, currentUser, &patch); err != nil {
		return patch, nil, false, err
	}
	if !patch.SetAssetID && !patch.SetAssignedTeamID && !patch.SetAssigneeID && !patch.SetCauseStatus && !patch.SetCauseTeamID {
		return patch, nil, false, nil
	}
	next := db.Issue{
		ID: issue.ID, AssetID: issue.AssetID, AssignedTeamID: issue.AssignedTeamID,
		AssigneeID: issue.AssigneeID, CauseTeamID: issue.CauseTeamID, CauseStatus: issue.CauseStatus,
	}
	if patch.SetAssetID {
		next.AssetID = patch.AssetID
	}
	if patch.SetAssignedTeamID {
		next.AssignedTeamID = patch.AssignedTeamID
	}
	if patch.SetAssigneeID {
		next.AssigneeID = patch.AssigneeID
	}
	if patch.SetCauseTeamID {
		next.CauseTeamID = patch.CauseTeamID
	}
	if patch.SetCauseStatus {
		next.CauseStatus = patch.CauseStatus.String
	}
	after := responsibilitySnapshot(next)
	if sameResponsibility(before, after) {
		return patch, nil, false, nil
	}
	audit := []db.InsertAuditLogParams{{
		UserID:      sql.NullInt64{Int64: currentUser.ID, Valid: true},
		Action:      auditActionAssignResponsibility,
		TargetTable: "issues",
		TargetID:    strconv.FormatInt(issue.ID, 10),
		OldValue:    mustJSON(before),
		NewValue:    mustJSON(after),
	}}
	if patch.SetCauseStatus || (patch.SetCauseTeamID && next.CauseStatus != "") {
		audit = append(audit, db.InsertAuditLogParams{
			UserID:      sql.NullInt64{Int64: currentUser.ID, Valid: true},
			Action:      auditActionVerifyCause,
			TargetTable: "issues",
			TargetID:    strconv.FormatInt(issue.ID, 10),
			OldValue:    mustJSON(map[string]any{"cause_status": issue.CauseStatus}),
			NewValue:    mustJSON(map[string]any{"cause_status": next.CauseStatus}),
		})
	}
	return patch, audit, true, nil
}

// applyAssignmentPatch validates asset, team, and assignee references for the patch.
func (s *ServiceImpl) applyAssignmentPatch(ctx context.Context, req PatchIssueRequest, currentUser db.User, patch *db.PatchIssueParams) error {
	if req.AssetID != nil {
		if *req.AssetID != nil {
			if _, err := s.loadSiteAsset(ctx, currentUser, **req.AssetID); err != nil {
				return err
			}
		}
		patch.SetAssetID = true
		patch.AssetID = nullInt64(*req.AssetID)
	}
	if req.AssignedTeamID != nil {
		if *req.AssignedTeamID != nil {
			team, err := s.loadSiteTeam(ctx, currentUser, **req.AssignedTeamID)
			if err != nil {
				return err
			}
			if !team.IsActive {
				return fmt.Errorf("%w: team is inactive", ErrInvalidResponsibility)
			}
		}
		patch.SetAssignedTeamID = true
		patch.AssignedTeamID = nullInt64(*req.AssignedTeamID)
	}
	if req.AssigneeID != nil {
		if *req.AssigneeID != nil {
			if _, err := s.loadSiteUser(ctx, currentUser, **req.AssigneeID); err != nil {
				return err
			}
		}
		patch.SetAssigneeID = true
		patch.AssigneeID = nullInt64(*req.AssigneeID)
	}
	return nil
}

// responsibilitySnapshot captures the auditable responsibility state of an issue.
func responsibilitySnapshot(issue db.Issue) map[string]any {
	return map[string]any{
		"asset_id":         nullableInt64(issue.AssetID),
		"assigned_team_id": nullableInt64(issue.AssignedTeamID),
		"assignee_id":      nullableInt64(issue.AssigneeID),
		"cause_team_id":    nullableInt64(issue.CauseTeamID),
		"cause_status":     issue.CauseStatus,
	}
}

// sameResponsibility reports whether two snapshots are equivalent.
func sameResponsibility(before, after map[string]any) bool {
	for _, key := range []string{"asset_id", "assigned_team_id", "assignee_id", "cause_team_id", "cause_status"} {
		if fmt.Sprint(before[key]) != fmt.Sprint(after[key]) {
			return false
		}
	}
	return true
}

// nullableInt64 converts a nullable column to a JSON-friendly pointer.
func nullableInt64(v sql.NullInt64) any {
	if !v.Valid {
		return nil
	}
	return v.Int64
}

// mustJSON marshals an audit payload, degrading to a null literal on failure.
func mustJSON(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		log.Printf("failed to marshal audit payload: %v", err)
		return json.RawMessage(`null`)
	}

	return encoded
}

// applyCausePatch validates a cause-status/team mutation and writes it onto the patch.
// Every cause mutation requires issue:verify_cause; UNVERIFIED and NOT_APPLICABLE clear the
// cause team, while CONFIRMED requires an active team within the caller's site.
func (s *ServiceImpl) applyCausePatch(ctx context.Context, req PatchIssueRequest, issue db.Issue, currentUser db.User, patch *db.PatchIssueParams) error {
	if req.CauseStatus == nil && req.CauseTeamID == nil {
		return nil
	}
	if !auth.HasPermission(ctx, auth.PermissionIssueVerifyCause) {
		return ErrPermissionDenied
	}
	status := issue.CauseStatus
	if req.CauseStatus != nil {
		if *req.CauseStatus == nil {
			status = CauseStatusUnverified
		} else {
			status = **req.CauseStatus
		}
	}
	if !isValidCauseStatus(status) {
		return fmt.Errorf("%w: invalid cause status", ErrInvalidResponsibility)
	}
	team := issue.CauseTeamID
	if req.CauseTeamID != nil {
		team = nullInt64(*req.CauseTeamID)
	}
	if status != CauseStatusConfirmed {
		if req.CauseTeamID != nil && team.Valid {
			return fmt.Errorf("%w: cause team requires CONFIRMED status", ErrInvalidResponsibility)
		}
		team = sql.NullInt64{}
	} else {
		if !team.Valid {
			return fmt.Errorf("%w: CONFIRMED cause requires a cause team", ErrInvalidResponsibility)
		}
		resolved, err := s.loadSiteTeam(ctx, currentUser, team.Int64)
		if err != nil {
			return err
		}
		if !resolved.IsActive {
			return fmt.Errorf("%w: cause team is inactive", ErrInvalidResponsibility)
		}
	}
	patch.SetCauseStatus = true
	patch.CauseStatus = sql.NullString{String: status, Valid: true}
	patch.SetCauseTeamID = true
	patch.CauseTeamID = team
	return nil
}
