package masterdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"6s/internal/apperror"
	"6s/internal/auth"
	"6s/internal/db"
	"6s/internal/i18n"
	"6s/internal/response"
)

// ResponsibilityStore persists responsibility-related master data.
type ResponsibilityStore interface {
	ListAssets(context.Context, db.ListAssetsParams) ([]db.Asset, error)
	GetAssetByID(context.Context, int64) (db.Asset, error)
	CreateAsset(context.Context, db.CreateAssetParams) (db.Asset, error)
	UpdateAsset(context.Context, db.UpdateAssetParams) (db.Asset, error)
	GetLocationByCode(context.Context, string) (db.Location, error)
	ListTeams(context.Context, db.ListTeamsParams) ([]db.Team, error)
	GetTeamByID(context.Context, int64) (db.Team, error)
	CreateTeam(context.Context, db.CreateTeamParams) (db.Team, error)
	UpdateTeam(context.Context, db.UpdateTeamParams) (db.Team, error)
	GetUserByID(context.Context, int64) (db.User, error)
	ListTeamMembers(context.Context, int64) ([]db.ListTeamMembersRow, error)
	AddTeamMembershipWithAudit(context.Context, db.AddTeamMembershipParams, db.InsertAuditLogParams) error
	DeleteTeamMembershipWithAudit(context.Context, db.DeleteTeamMembershipParams, db.InsertAuditLogParams) error
}

// ResponsibilityHandler serves asset, team, and membership endpoints.
type ResponsibilityHandler struct{ store ResponsibilityStore }

// NewResponsibilityHandler creates a responsibility handler backed by s.
func NewResponsibilityHandler(s ResponsibilityStore) *ResponsibilityHandler {
	return &ResponsibilityHandler{store: s}
}

// AssetResponse is the API representation of an asset.
type AssetResponse struct {
	ID            int64   `json:"id"`
	SiteID        int64   `json:"site_id"`
	LocationCode  string  `json:"location_code"`
	AssetCode     string  `json:"asset_code"`
	Name          string  `json:"name"`
	AssetType     *string `json:"asset_type"`
	DefaultTeamID *int64  `json:"default_team_id"`
	IsActive      bool    `json:"is_active"`
}

func assetResponse(a db.Asset) AssetResponse {
	r := AssetResponse{ID: a.ID, SiteID: a.SiteID, LocationCode: a.LocationCode, AssetCode: a.AssetCode, Name: a.Name, IsActive: a.IsActive}
	if a.AssetType.Valid {
		r.AssetType = &a.AssetType.String
	}
	if a.DefaultTeamID.Valid {
		r.DefaultTeamID = &a.DefaultTeamID.Int64
	}
	return r
}

// TeamResponse is the API representation of a team.
type TeamResponse struct {
	ID       int64  `json:"id"`
	SiteID   int64  `json:"site_id"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	IsActive bool   `json:"is_active"`
}

func teamResponse(t db.Team) TeamResponse {
	return TeamResponse{ID: t.ID, SiteID: t.SiteID, Code: t.Code, Name: t.Name, IsActive: t.IsActive}
}

// TeamMemberResponse is the safe API representation of a team member.
type TeamMemberResponse struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

type assetInput struct {
	LocationCode  string  `json:"location_code"`
	AssetCode     string  `json:"asset_code"`
	Name          string  `json:"name"`
	AssetType     *string `json:"asset_type"`
	DefaultTeamID *int64  `json:"default_team_id"`
	IsActive      *bool   `json:"is_active"`
}

func currentUser(r *http.Request) (db.User, bool) { return auth.GetUserFromContext(r.Context()) }
func siteVisible(u db.User, siteID int64) bool {
	return u.Role == string(auth.RoleSuperadmin) || (u.SiteID > 0 && u.SiteID == siteID)
}
func parseID(r *http.Request, name string) (int64, bool) {
	id, err := response.ParseIDParam(r, name)
	return id, err == nil && id > 0
}
func bad(w http.ResponseWriter, r *http.Request, err error) { _ = response.RenderError(w, r, err) }
func notFound(w http.ResponseWriter, r *http.Request)       { bad(w, r, apperror.NotFound(i18n.ErrNotFound)) }
func invalid(w http.ResponseWriter, r *http.Request, msg string) {
	bad(w, r, apperror.BadRequest(i18n.ErrInvalidInput, msg))
}

func (h *ResponsibilityHandler) validateAssetRefs(ctx context.Context, siteID int64, location string, teamID *int64) error {
	loc, err := h.store.GetLocationByCode(ctx, location)
	if err != nil {
		return fmt.Errorf("location: %w", err)
	}
	if loc.SiteID != siteID {
		return errors.New("location belongs to another site")
	}
	if teamID != nil {
		team, err := h.store.GetTeamByID(ctx, *teamID)
		if err != nil {
			return fmt.Errorf("team: %w", err)
		}
		if team.SiteID != siteID || !team.IsActive {
			return errors.New("default team is invalid for site")
		}
	}
	return nil
}

// ListAssets serves the asset list endpoint.
func (h *ResponsibilityHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r)
	if !ok {
		bad(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}
	siteID := u.SiteID
	if v := r.URL.Query().Get("site_id"); v != "" {
		var err error
		if _, err = fmt.Sscan(v, &siteID); err != nil || siteID <= 0 {
			invalid(w, r, "invalid site_id")
			return
		}
		if !siteVisible(u, siteID) {
			bad(w, r, apperror.Forbidden(i18n.ErrForbidden))
			return
		}
	}
	p := db.ListAssetsParams{SiteID: sql.NullInt64{Int64: siteID, Valid: siteID > 0}}
	q := r.URL.Query()
	p.LocationCode = sql.NullString{String: q.Get("location_code"), Valid: q.Get("location_code") != ""}
	if v := q.Get("is_active"); v != "" {
		if v != "true" && v != "false" {
			invalid(w, r, "is_active must be boolean")
			return
		}
		p.IsActive = sql.NullBool{Bool: v == "true", Valid: true}
	}
	rows, err := h.store.ListAssets(r.Context(), p)
	if err != nil {
		bad(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	out := make([]AssetResponse, 0, len(rows))
	for _, a := range rows {
		out = append(out, assetResponse(a))
	}
	_ = response.JSON(w, http.StatusOK, out)
}

// ListTeams serves the team list endpoint.
func (h *ResponsibilityHandler) ListTeams(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r)
	if !ok {
		bad(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}
	siteID := u.SiteID
	if v := r.URL.Query().Get("site_id"); v != "" {
		if _, err := fmt.Sscan(v, &siteID); err != nil || siteID <= 0 {
			invalid(w, r, "invalid site_id")
			return
		}
		if !siteVisible(u, siteID) {
			bad(w, r, apperror.Forbidden(i18n.ErrForbidden))
			return
		}
	}
	p := db.ListTeamsParams{SiteID: sql.NullInt64{Int64: siteID, Valid: siteID > 0}}
	if v := r.URL.Query().Get("is_active"); v != "" {
		if v != "true" && v != "false" {
			invalid(w, r, "is_active must be boolean")
			return
		}
		p.IsActive = sql.NullBool{Bool: v == "true", Valid: true}
	}
	rows, err := h.store.ListTeams(r.Context(), p)
	if err != nil {
		bad(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	out := make([]TeamResponse, 0, len(rows))
	for _, t := range rows {
		out = append(out, teamResponse(t))
	}
	_ = response.JSON(w, http.StatusOK, out)
}

// CreateAsset creates an asset.
func (h *ResponsibilityHandler) CreateAsset(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r)
	if !ok {
		bad(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}
	var in assetInput
	if json.NewDecoder(r.Body).Decode(&in) != nil || strings.TrimSpace(in.LocationCode) == "" || strings.TrimSpace(in.AssetCode) == "" || strings.TrimSpace(in.Name) == "" {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}
	if err := h.validateAssetRefs(r.Context(), u.SiteID, in.LocationCode, in.DefaultTeamID); err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrInvalidInput).WithCause(err))
		return
	}
	p := db.CreateAssetParams{SiteID: u.SiteID, LocationCode: strings.TrimSpace(in.LocationCode), AssetCode: strings.TrimSpace(in.AssetCode), Name: strings.TrimSpace(in.Name), AssetType: nullString(in.AssetType), DefaultTeamID: nullInt(in.DefaultTeamID)}
	if in.IsActive != nil {
		p.IsActive = *in.IsActive
	}
	a, err := h.store.CreateAsset(r.Context(), p)
	if err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	_ = response.JSON(w, http.StatusCreated, assetResponse(a))
}

// UpdateAsset updates an asset with OpenAPI partial-update semantics.
func (h *ResponsibilityHandler) UpdateAsset(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r)
	if !ok {
		bad(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}
	id, ok := parseID(r, "id")
	if !ok {
		bad(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	old, err := h.store.GetAssetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			notFound(w, r)
		} else {
			bad(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		}
		return
	}
	if !siteVisible(u, old.SiteID) {
		notFound(w, r)
		return
	}
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}
	body, err := json.Marshal(raw)
	if err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}
	var in assetInput
	if err := json.Unmarshal(body, &in); err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}
	p, err := assetUpdateParams(raw, old)
	if err != nil {
		invalid(w, r, err.Error())
		return
	}
	if in.IsActive != nil {
		p.IsActive = sql.NullBool{Bool: *in.IsActive, Valid: true}
	}
	location := old.LocationCode
	if p.LocationCode.Valid {
		location = p.LocationCode.String
	}
	var teamID *int64
	if p.DefaultTeamID.Valid {
		teamID = &p.DefaultTeamID.Int64
	}
	if err := h.validateAssetRefs(r.Context(), old.SiteID, location, teamID); err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrInvalidInput).WithCause(err))
		return
	}
	a, err := h.store.UpdateAsset(r.Context(), p)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			notFound(w, r)
		} else {
			bad(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		}
		return
	}
	_ = response.JSON(w, http.StatusOK, assetResponse(a))
}

type teamInput struct {
	Code     *string `json:"code"`
	Name     *string `json:"name"`
	IsActive *bool   `json:"is_active"`
}

// CreateTeam creates a team.
func (h *ResponsibilityHandler) CreateTeam(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r)
	if !ok {
		bad(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}
	var in struct {
		Code     string `json:"code"`
		Name     string `json:"name"`
		IsActive *bool  `json:"is_active"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || strings.TrimSpace(in.Code) == "" || strings.TrimSpace(in.Name) == "" {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}
	p := db.CreateTeamParams{SiteID: u.SiteID, Code: strings.TrimSpace(in.Code), Name: strings.TrimSpace(in.Name)}
	if in.IsActive != nil {
		p.IsActive = *in.IsActive
	}
	t, err := h.store.CreateTeam(r.Context(), p)
	if err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	_ = response.JSON(w, http.StatusCreated, teamResponse(t))
}

// UpdateTeam updates a team.
func (h *ResponsibilityHandler) UpdateTeam(w http.ResponseWriter, r *http.Request) {
	u, ok := currentUser(r)
	if !ok {
		bad(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return
	}
	id, ok := parseID(r, "id")
	if !ok {
		bad(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	old, err := h.store.GetTeamByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			notFound(w, r)
		} else {
			bad(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		}
		return
	}
	if !siteVisible(u, old.SiteID) {
		notFound(w, r)
		return
	}
	var in teamInput
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest))
		return
	}
	p := db.UpdateTeamParams{ID: id, Code: nullString(in.Code), Name: nullString(in.Name)}
	if in.IsActive != nil {
		p.IsActive = sql.NullBool{Bool: *in.IsActive, Valid: true}
	}
	t, err := h.store.UpdateTeam(r.Context(), p)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			notFound(w, r)
		} else {
			bad(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		}
		return
	}
	_ = response.JSON(w, http.StatusOK, teamResponse(t))
}

func (h *ResponsibilityHandler) getVisibleTeam(w http.ResponseWriter, r *http.Request) (db.User, db.Team, bool) {
	u, ok := currentUser(r)
	if !ok {
		bad(w, r, apperror.Unauthorized(i18n.ErrUnauthorized))
		return db.User{}, db.Team{}, false
	}
	id, ok := parseID(r, "id")
	if !ok {
		bad(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return db.User{}, db.Team{}, false
	}
	t, err := h.store.GetTeamByID(r.Context(), id)
	if err != nil || !siteVisible(u, t.SiteID) {
		notFound(w, r)
		return db.User{}, db.Team{}, false
	}
	return u, t, true
}

// ListMembers serves the team membership list endpoint.
func (h *ResponsibilityHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	_, _, ok := h.getVisibleTeam(w, r)
	if !ok {
		return
	}
	id, _ := response.ParseIDParam(r, "id")
	rows, err := h.store.ListTeamMembers(r.Context(), id)
	if err != nil {
		bad(w, r, apperror.Internal(i18n.ErrInternal).WithCause(err))
		return
	}
	out := make([]TeamMemberResponse, 0, len(rows))
	for _, m := range rows {
		out = append(out, TeamMemberResponse{ID: m.ID, Username: m.Username, FullName: m.FullName, Role: m.Role, IsActive: m.IsActive})
	}
	_ = response.JSON(w, http.StatusOK, out)
}
func (h *ResponsibilityHandler) membership(w http.ResponseWriter, r *http.Request, add bool) {
	u, t, ok := h.getVisibleTeam(w, r)
	if !ok {
		return
	}
	uid, ok := parseID(r, "userID")
	if !ok {
		bad(w, r, apperror.BadRequest(i18n.ErrInvalidID))
		return
	}
	user, err := h.store.GetUserByID(r.Context(), uid)
	if err != nil || user.SiteID != t.SiteID {
		notFound(w, r)
		return
	}
	if !user.IsActive && add {
		bad(w, r, apperror.BadRequest(i18n.ErrInvalidInput, "user must be active"))
		return
	}
	actorID := sql.NullInt64{Int64: u.ID, Valid: u.ID > 0}
	action := "TEAM_MEMBER_DELETE"
	if add {
		action = "TEAM_MEMBER_ADD"
	}
	oldJSON, _ := json.Marshal(map[string]any{"team_id": t.ID, "user_id": uid})
	newJSON, _ := json.Marshal(map[string]any{"team_id": t.ID, "user_id": uid, "action": action})
	audit := db.InsertAuditLogParams{UserID: actorID, Action: action, TargetTable: "team_memberships", TargetID: fmt.Sprintf("%d:%d", t.ID, uid), OldValue: oldJSON, NewValue: newJSON, IpAddress: sql.NullString{String: r.RemoteAddr, Valid: r.RemoteAddr != ""}, UserAgent: sql.NullString{String: r.UserAgent(), Valid: r.UserAgent() != ""}}
	if add {
		err = h.store.AddTeamMembershipWithAudit(r.Context(), db.AddTeamMembershipParams{TeamID: t.ID, UserID: uid}, audit)
	} else {
		err = h.store.DeleteTeamMembershipWithAudit(r.Context(), db.DeleteTeamMembershipParams{TeamID: t.ID, UserID: uid}, audit)
	}
	if err != nil {
		bad(w, r, apperror.BadRequest(i18n.ErrBadRequest).WithCause(err))
		return
	}
	if add {
		_ = response.JSON(w, http.StatusOK, map[string]int64{"team_id": t.ID, "user_id": uid})
	} else {
		w.WriteHeader(http.StatusNoContent)
	}
}

// AddMember adds a user to a team.
func (h *ResponsibilityHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	h.membership(w, r, true)
}

// DeleteMember removes a user from a team.
func (h *ResponsibilityHandler) DeleteMember(w http.ResponseWriter, r *http.Request) {
	h.membership(w, r, false)
}
func nullString(v *string) sql.NullString {
	if v == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *v, Valid: true}
}
func nullInt(v *int64) sql.NullInt64 {
	if v == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *v, Valid: true}
}

// assetUpdateParams builds partial-update parameters from the raw request body.
// Absent keys and empty strings keep the stored value; an explicit null clears
// asset_type or default_team_id.
func assetUpdateParams(raw map[string]json.RawMessage, old db.Asset) (db.UpdateAssetParams, error) {
	p := db.UpdateAssetParams{
		ID:            old.ID,
		LocationCode:  sql.NullString{String: old.LocationCode, Valid: true},
		AssetCode:     sql.NullString{String: old.AssetCode, Valid: true},
		Name:          sql.NullString{String: old.Name, Valid: true},
		AssetType:     old.AssetType,
		DefaultTeamID: old.DefaultTeamID,
	}
	for _, field := range []struct {
		key    string
		target *sql.NullString
	}{
		{"location_code", &p.LocationCode},
		{"asset_code", &p.AssetCode},
		{"name", &p.Name},
	} {
		in, ok := raw[field.key]
		if !ok {
			continue
		}
		var value string
		if json.Unmarshal(in, &value) != nil {
			return p, fmt.Errorf("%s must be a string", field.key)
		}
		if value == "" {
			continue
		}
		*field.target = sql.NullString{String: value, Valid: true}
	}
	if in, ok := raw["asset_type"]; ok {
		if string(in) == "null" {
			p.AssetType = sql.NullString{}
		} else {
			var value string
			if json.Unmarshal(in, &value) != nil {
				return p, errors.New("asset_type must be a string or null")
			}
			p.AssetType = sql.NullString{String: value, Valid: true}
		}
	}
	if in, ok := raw["default_team_id"]; ok {
		if string(in) == "null" {
			p.DefaultTeamID = sql.NullInt64{}
		} else {
			var teamID int64
			if json.Unmarshal(in, &teamID) != nil || teamID <= 0 {
				return p, errors.New("default_team_id must be a positive integer or null")
			}
			p.DefaultTeamID = sql.NullInt64{Int64: teamID, Valid: true}
		}
	}
	return p, nil
}
