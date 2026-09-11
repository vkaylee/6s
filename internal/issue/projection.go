package issue

import (
	"6s/internal/ai"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/i18n"
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"os"
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

// broadcast emits an event to all active SSE subscribers.

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
	for _, t := range tagRows {
		tags = append(tags, t.Code)
	}
	resp := toIssueResponse(issue, loc.NameVi, tags, creator, resolver)
	if issue.Description.Valid && strings.TrimSpace(issue.Description.String) != "" {
		targetLang := ai.NormalizeLangCode(i18n.FromContext(ctx))
		h := ai.ComputeContentHash(issue.Description.String)
		if cachedRows, cErr := s.store.GetTranslationCacheBatch(ctx, db.GetTranslationCacheBatchParams{ContentHashes: []string{h}, TargetLang: targetLang}); cErr == nil && len(cachedRows) > 0 && cachedRows[0].TranslatedText != "" {
			resp.TranslatedDescription = &cachedRows[0].TranslatedText
		}
	}
	return resp, nil
}

// ListIssuesFiltered lists issues with filter criteria.

// ListIssuesFiltered lists issues with filter criteria.
func (s *ServiceImpl) ListIssuesFiltered(ctx context.Context, statuses, categories, locationCodes []string, overdue bool, page, limit int) ([]Response, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	if statuses == nil {
		statuses = []string{}
	}
	if categories == nil {
		categories = []string{}
	}
	if locationCodes == nil {
		locationCodes = []string{}
	}

	var overdueParam sql.NullBool
	if overdue {
		overdueParam = sql.NullBool{Bool: true, Valid: true}
	}

	if limit > math.MaxInt32 || offset > math.MaxInt32 {
		return nil, 0, fmt.Errorf("pagination exceeds database limit")
	}
	currentUser := userFromContext(ctx)
	rows, err := s.store.ListIssuesFiltered(ctx, db.ListIssuesFilteredParams{
		Statuses: statuses, Categories: categories, LocationCodes: locationCodes, Overdue: overdueParam,
		SiteID: currentUser.SiteID, UserID: currentUser.ID, Role: currentUser.Role,
		Limit: int32(limit), Offset: int32(offset), //nolint:gosec // bounded above
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list issues failed: %w", err)
	}

	total, err := s.store.CountIssuesFiltered(ctx, db.CountIssuesFilteredParams{
		Statuses: statuses, Categories: categories, LocationCodes: locationCodes, Overdue: overdueParam,
		SiteID: userFromContext(ctx).SiteID, UserID: userFromContext(ctx).ID, Role: userFromContext(ctx).Role,
	})
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
	for _, tr := range tagRows {
		tagsByIssue[tr.IssueID] = append(tagsByIssue[tr.IssueID], tr.Code)
	}

	items := make([]Response, 0, len(rows))
	for i, r := range rows {
		var trans *string
		if t, ok := translations[i]; ok {
			trans = &t
		}
		items = append(items, toFilteredRowResponse(r, tagsByIssue[r.ID], trans))
	}

	return items, total, nil
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

func toFilteredRowResponse(r db.ListIssuesFilteredRow, tags []string, trans *string) Response {
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
	resp := toIssueResponse(issue, r.LocationNameVi, tags, creator, resolver)
	resp.ScoreDeducted = r.ScoreDeducted
	resp.TranslatedDescription = trans
	return *resp
}

func toIssueResponse(issue db.Issue, locName string, tags []string, creator db.User, resolver *UserItem) *Response {
	resp := &Response{
		ID: issue.ID, ClientUUID: issue.ClientUuid, Version: issue.Version, SiteID: issue.SiteID,
		Category: issue.Category, CauseType: issue.CauseType, LocationCode: issue.LocationCode,
		LocationName: locName, Tags: tags, Status: issue.Status, VisibilityClass: issue.VisibilityClass,
		Creator:  UserItem{ID: creator.ID, Username: creator.Username, FullName: creator.FullName},
		Resolver: resolver, CreatedAt: issue.CreatedAt.Format(time.RFC3339),
	}
	if issue.AssigneeID.Valid {
		v := issue.AssigneeID.Int64
		resp.AssigneeID = &v
	}
	if issue.AssignedTeamID.Valid {
		v := issue.AssignedTeamID.Int64
		resp.AssignedTeamID = &v
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
