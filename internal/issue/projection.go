package issue

import (
	"6s/internal/ai"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/i18n"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"
	"time"
)

// OpenMedia authorizes issue visibility before opening its controlled attachment.
func (s *ServiceImpl) OpenMedia(ctx context.Context, id int64, folder, basename string) (*os.File, error) {
	issue, err := s.store.GetIssueByID(ctx, id)
	if err != nil || !s.canViewIssue(ctx, issue) {
		return nil, ErrIssueNotFound
	}
	return s.storageManager.OpenAttachment(folder, basename)
}

func (s *ServiceImpl) canViewIssue(ctx context.Context, issue db.Issue) bool {
	user, ok := auth.GetUserFromContext(ctx)
	if !ok {
		return true
	}
	if issue.SiteID != 0 && user.SiteID != 0 && issue.SiteID != user.SiteID {
		return false
	}
	if issue.VisibilityClass == "SITE_PUBLIC" {
		return true
	}
	if issue.AssignedTeamID.Valid && user.IsActive {
		if _, err := s.store.GetTeamMembership(ctx, db.GetTeamMembershipParams{TeamID: issue.AssignedTeamID.Int64, UserID: user.ID}); err == nil {
			return true
		}
	}
	if issue.CreatorID == user.ID || (issue.AssigneeID.Valid && issue.AssigneeID.Int64 == user.ID) {
		return true
	}
	if user.Role == auth.RoleSafetyOfficer.String() || user.Role == auth.RoleAdmin.String() || user.Role == auth.RoleSuperadmin.String() {
		return true
	}
	if user.Role == auth.RoleLineLeader.String() {
		scope, err := auth.LocationScope(ctx, s.store, user)
		if err != nil {
			return false
		}
		return scope.CanAccessLocation(issue.LocationCode)
	}
	return false
}

// GetIssueByID retrieves detailed issue response with the same visibility policy as list.
func (s *ServiceImpl) GetIssueByID(ctx context.Context, id int64) (*Response, error) {
	issue, err := s.store.GetIssueByID(ctx, id)
	if err != nil || !s.canViewIssue(ctx, issue) {
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
			resolver = &UserItem{ID: resUser.ID, Username: resUser.Username, FullName: resUser.FullName}
		}
	}
	tagRows, tagErr := s.store.ListTagsForIssue(ctx, issue.ID)
	if tagErr != nil {
		log.Printf("list tags for issue failed: %v", tagErr)
	}
	tags := make([]string, 0, len(tagRows))
	tagDetails := make([]TagDetail, 0, len(tagRows))
	for _, t := range tagRows {
		tags = append(tags, t.Code)
		tagDetails = append(tagDetails, TagDetail{
			Code:     t.Code,
			NameVi:   t.NameVi,
			NameZh:   t.NameZh,
			NameEn:   t.NameEn,
			Category: t.Category,
			Status:   t.Status,
		})
	}
	resp := toIssueResponse(issue, loc.NameVi, tags, tagDetails, creator, resolver)
	if issue.Description.Valid && strings.TrimSpace(issue.Description.String) != "" {
		targetLang := ai.NormalizeLangCode(i18n.FromContext(ctx))
		h := ai.ComputeContentHash(issue.Description.String)
		if cachedRows, cErr := s.store.GetTranslationCacheBatch(ctx, db.GetTranslationCacheBatchParams{ContentHashes: []string{h}, TargetLang: targetLang}); cErr == nil && len(cachedRows) > 0 && cachedRows[0].TranslatedText != "" {
			resp.TranslatedDescription = &cachedRows[0].TranslatedText
		}
	}
	resp.ResponsibilityHistory = s.responsibilityHistory(ctx, issue.ID)
	resp.AllowedActions = s.allowedActionsFor(ctx, issue)
	return resp, nil
}

// ListIssuesFiltered lists issues with filter criteria.
func (s *ServiceImpl) ListIssuesFiltered(ctx context.Context, filter ListFilter) ([]Response, int64, error) {
	filter = normalizeListFilter(filter)
	if filter.Limit > math.MaxInt32 || filter.Offset() > math.MaxInt32 {
		return nil, 0, fmt.Errorf("pagination exceeds database limit")
	}
	currentUser := userFromContext(ctx)
	rows, err := s.store.ListIssuesFiltered(ctx, filter.toListParams(currentUser))
	if err != nil {
		return nil, 0, fmt.Errorf("list issues failed: %w", err)
	}

	total, err := s.store.CountIssuesFiltered(ctx, filter.toCountParams(currentUser))
	if err != nil {
		total = int64(len(rows))
	}

	translations := s.loadTranslationsForRows(ctx, rows)

	issueIDs := make([]int64, 0, len(rows))
	for _, r := range rows {
		issueIDs = append(issueIDs, r.ID)
	}
	tagRows, tagErr := s.store.ListTagsForIssues(ctx, issueIDs)
	if tagErr != nil {
		log.Printf("failed to list tags: %v", tagErr)
	}
	tagsByIssue := make(map[int64][]string, len(rows))
	tagDetailsByIssue := make(map[int64][]TagDetail, len(rows))
	for _, tr := range tagRows {
		tagsByIssue[tr.IssueID] = append(tagsByIssue[tr.IssueID], tr.Code)
		tagDetailsByIssue[tr.IssueID] = append(tagDetailsByIssue[tr.IssueID], TagDetail{
			Code:     tr.Code,
			NameVi:   tr.NameVi,
			NameZh:   tr.NameZh,
			NameEn:   tr.NameEn,
			Category: tr.Category,
			Status:   tr.Status,
		})
	}

	items := make([]Response, 0, len(rows))
	for i, r := range rows {
		var trans *string
		if t, ok := translations[i]; ok {
			trans = &t
		}
		items = append(items, toFilteredRowResponse(r, tagsByIssue[r.ID], tagDetailsByIssue[r.ID], trans))
	}

	return items, total, nil
}

// normalizeListFilter applies list defaults shared by list, count, and export.
func normalizeListFilter(filter ListFilter) ListFilter {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 || filter.Limit > 100 {
		filter.Limit = 20
	}
	if filter.Statuses == nil {
		filter.Statuses = []string{}
	}
	if filter.Categories == nil {
		filter.Categories = []string{}
	}
	if filter.LocationCodes == nil {
		filter.LocationCodes = []string{}
	}
	return filter
}

// responsibilityHistory loads the audited assignment and cause changes for an issue.
func (s *ServiceImpl) responsibilityHistory(ctx context.Context, issueID int64) []ResponsibilityHistoryEntry {
	rows, err := s.store.GetIssueResponsibilityHistory(ctx, strconv.FormatInt(issueID, 10))
	if err != nil {
		log.Printf("failed to load responsibility history for issue %d: %v", issueID, err)
		return nil
	}
	entries := make([]ResponsibilityHistoryEntry, 0, len(rows))
	for _, r := range rows {
		entry := ResponsibilityHistoryEntry{
			ID: r.ID, Action: historyAction(r), OldValue: r.OldValue, NewValue: r.NewValue,
			CreatedAt: r.CreatedAt.Format(time.RFC3339),
		}
		if r.UserID.Valid {
			u := r.UserID.Int64
			entry.ChangedBy = &u
		}
		if r.ChangedByName.Valid {
			n := r.ChangedByName.String
			entry.ChangedByName = &n
		}
		entries = append(entries, entry)
	}
	return entries
}

// historyAction maps an audited responsibility row to the stable API action enum.
// Rows written before this mapping existed, or by a store using other actions,
// degrade to HistoryActionOther instead of leaking raw audit names.
func historyAction(row db.ListIssueResponsibilityHistoryRow) string {
	switch row.Action {
	case auditActionAssignResponsibility:
		return ownerChangeAction(row.OldValue, row.NewValue)
	case auditActionVerifyCause:
		return HistoryActionCauseVerify
	default:
		return HistoryActionOther
	}
}

// ownerChangeAction classifies an assignment audit by what happened to the handling owner.
// Only a new owner (ASSIGN) or a replaced owner (TRANSFER) is named; an asset-only edit or a
// cleared owner that leaves handling unchanged stays generic.
func ownerChangeAction(oldValue, newValue json.RawMessage) string {
	oldOwner, oldOK := decodeOwnerSnapshot(oldValue)
	newOwner, newOK := decodeOwnerSnapshot(newValue)
	if !oldOK || !newOK || newOwner.empty() {
		return HistoryActionOther
	}
	if oldOwner.empty() {
		return HistoryActionAssign
	}
	if !oldOwner.equal(newOwner) {
		return HistoryActionTransfer
	}
	return HistoryActionOther
}

// ownerSnapshot is the assigned team and assignee pair recorded in a responsibility audit.
type ownerSnapshot struct {
	TeamID     *int64 `json:"assigned_team_id"`
	AssigneeID *int64 `json:"assignee_id"`
}

// decodeOwnerSnapshot decodes a responsibility snapshot; ok is false when the payload is not JSON.
func decodeOwnerSnapshot(raw json.RawMessage) (ownerSnapshot, bool) {
	var decoded ownerSnapshot
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return ownerSnapshot{}, false
	}
	return decoded, true
}

// empty reports whether neither a team nor an assignee owns handling.
func (o ownerSnapshot) empty() bool { return o.TeamID == nil && o.AssigneeID == nil }

// equal reports whether two snapshots name the same handling owner.
func (o ownerSnapshot) equal(other ownerSnapshot) bool {
	return sameOptionalID(o.TeamID, other.TeamID) && sameOptionalID(o.AssigneeID, other.AssigneeID)
}

// sameOptionalID compares two nullable identifiers.
func sameOptionalID(a, b *int64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// allowedActionsFor reports which lifecycle actions the caller may perform on this issue.
func (s *ServiceImpl) allowedActionsFor(ctx context.Context, issue db.Issue) *AllowedActions {
	user, ok := auth.GetUserFromContext(ctx)
	if !ok {
		return nil
	}
	open := issue.Status == StatusOpen.String()
	review := issue.Status == StatusPendingReview.String()
	return &AllowedActions{
		Assign:      (open || review) && auth.HasPermission(ctx, auth.PermissionIssueAssign),
		VerifyCause: (open || review) && auth.HasPermission(ctx, auth.PermissionIssueVerifyCause),
		Resolve:     open && s.canResolveIssue(ctx, user, issue),
		Close:       review && s.canCloseIssue(ctx, user, issue) && !(issue.ResolverID.Valid && issue.ResolverID.Int64 == user.ID),
	}
}

// canResolveIssue reports whether the caller may resolve this issue: the assignee, a member of the
// assigned team (any location within the site), or a resolver whose location scope covers it.
func (s *ServiceImpl) canResolveIssue(ctx context.Context, currentUser db.User, issue db.Issue) bool {
	if !auth.HasPermission(ctx, auth.PermissionIssueResolve) {
		return false
	}
	if issue.CreatorID == currentUser.ID {
		return true
	}
	if issue.AssigneeID.Valid && issue.AssigneeID.Int64 == currentUser.ID {
		return true
	}
	if issue.AssignedTeamID.Valid {
		if _, err := s.store.GetTeamMembership(ctx, db.GetTeamMembershipParams{TeamID: issue.AssignedTeamID.Int64, UserID: currentUser.ID}); err == nil {
			return true
		}
	}
	scope, err := auth.LocationScope(ctx, s.store, currentUser)
	if err != nil {
		return false
	}
	return scope.CanAccessLocation(issue.LocationCode)
}

func (s *ServiceImpl) loadTranslationsForRows(ctx context.Context, rows []db.ListIssuesFilteredRow) map[int]string {
	targetLang := ai.NormalizeLangCode(i18n.FromContext(ctx))
	hashToIndices := make(map[string][]int)
	var hashes []string
	for i, r := range rows {
		if r.Description.Valid && strings.TrimSpace(r.Description.String) != "" {
			h := ai.ComputeContentHash(r.Description.String)
			if _, exists := hashToIndices[h]; !exists {
				hashes = append(hashes, h)
			}
			hashToIndices[h] = append(hashToIndices[h], i)
		}
	}

	translations := make(map[int]string)
	if len(hashes) == 0 {
		return translations
	}

	cachedRows, err := s.store.GetTranslationCacheBatch(ctx, db.GetTranslationCacheBatchParams{
		ContentHashes: hashes,
		TargetLang:    targetLang,
	})
	if err != nil {
		return translations
	}

	for _, cr := range cachedRows {
		if cr.TranslatedText != "" {
			for _, idx := range hashToIndices[cr.ContentHash] {
				translations[idx] = cr.TranslatedText
			}
		}
	}
	return translations
}

func toFilteredRowResponse(r db.ListIssuesFilteredRow, tags []string, tagDetails []TagDetail, trans *string) Response {
	issue := db.Issue{
		ID:              r.ID,
		ClientUuid:      r.ClientUuid,
		Version:         r.Version,
		SiteID:          r.SiteID,
		CreatorID:       r.CreatorID,
		ResolverID:      r.ResolverID,
		AssigneeID:      r.AssigneeID,
		AssignedTeamID:  r.AssignedTeamID,
		Category:        r.Category,
		CauseType:       r.CauseType,
		VisibilityClass: r.VisibilityClass,
		LocationCode:    r.LocationCode,
		AssetID:         r.AssetID,
		CauseTeamID:     r.CauseTeamID,
		CauseStatus:     r.CauseStatus,
		Description:     r.Description,
		RejectReason:    r.RejectReason,
		PhotoBefore:     r.PhotoBefore,
		PhotoDetail:     r.PhotoDetail,
		PhotoAfter:      r.PhotoAfter,
		ScoreRating:     r.ScoreRating,
		Status:          r.Status,
		CreatedAt:       r.CreatedAt,
		ResolvedAt:      r.ResolvedAt,
		ClosedAt:        r.ClosedAt,
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
	resp := toIssueResponse(issue, r.LocationNameVi, tags, tagDetails, creator, resolver)
	resp.ScoreDeducted = r.ScoreDeducted
	resp.TranslatedDescription = trans
	return *resp
}

func toIssueResponse(issue db.Issue, locName string, tags []string, tagDetails []TagDetail, creator db.User, resolver *UserItem) *Response {
	if tags == nil {
		tags = make([]string, 0)
	}
	if tagDetails == nil {
		tagDetails = make([]TagDetail, 0)
	}
	resp := &Response{
		ID: issue.ID, ClientUUID: issue.ClientUuid, Version: issue.Version, SiteID: issue.SiteID,
		Category: issue.Category, CauseType: issue.CauseType, LocationCode: issue.LocationCode,
		LocationName: locName, Tags: tags, TagDetails: tagDetails, Status: issue.Status, VisibilityClass: issue.VisibilityClass,
		Creator:  UserItem{ID: creator.ID, Username: creator.Username, FullName: creator.FullName},
		Resolver: resolver, CreatedAt: issue.CreatedAt.Format(time.RFC3339),
	}
	if issue.LocationNameViSnapshot.Valid {
		value := issue.LocationNameViSnapshot.String
		resp.LocationNameViSnapshot = &value
	}
	if issue.LocationNameZhSnapshot.Valid {
		value := issue.LocationNameZhSnapshot.String
		resp.LocationNameZhSnapshot = &value
	}
	if issue.LocationNameEnSnapshot.Valid {
		value := issue.LocationNameEnSnapshot.String
		resp.LocationNameEnSnapshot = &value
	}
	if issue.LocationSnapshotSource.Valid {
		value := issue.LocationSnapshotSource.String
		resp.LocationSnapshotSource = &value
	}
	if issue.LocationSnapshotRecordedAt.Valid {
		value := issue.LocationSnapshotRecordedAt.Time.Format(time.RFC3339)
		resp.LocationSnapshotRecordedAt = &value
	}
	if issue.AssigneeID.Valid {
		v := issue.AssigneeID.Int64
		resp.AssigneeID = &v
	}
	if issue.AssignedTeamID.Valid {
		v := issue.AssignedTeamID.Int64
		resp.AssignedTeamID = &v
	}
	if issue.AssetID.Valid {
		v := issue.AssetID.Int64
		resp.AssetID = &v
	}
	if issue.CauseTeamID.Valid {
		v := issue.CauseTeamID.Int64
		resp.CauseTeamID = &v
	}
	if issue.CauseStatus == "" {
		resp.CauseStatus = CauseStatusUnverified
	} else {
		resp.CauseStatus = issue.CauseStatus
	}

	if issue.Description.Valid {
		resp.Description = &issue.Description.String
	}
	if issue.RejectReason.Valid {
		resp.RejectReason = &issue.RejectReason.String
	}
	if issue.PhotoDetail.Valid && issue.PhotoDetail.String != "" {
		pDetail := formatPhotoURL(issue.ID, "detail", issue.PhotoDetail.String)
		resp.PhotoDetail = &pDetail
	}
	if issue.PhotoAfter.Valid && issue.PhotoAfter.String != "" {
		pAfter := formatPhotoURL(issue.ID, "after", issue.PhotoAfter.String)
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
	resp.PhotoBefore = formatPhotoURL(issue.ID, "before", issue.PhotoBefore)

	return resp
}

func formatPhotoURL(issueID int64, folder, filename string) string {
	if filename == "" {
		return ""
	}
	if strings.HasPrefix(filename, "/") || strings.HasPrefix(filename, "data:") {
		return filename
	}
	return fmt.Sprintf("/api/issues/%d/media/%s/%s", issueID, folder, filename)
}
