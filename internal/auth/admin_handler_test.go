package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"6s/internal/db"
)

// adminStoreAdapter adapts mockFullStore to AdminStore.
type adminStoreAdapter struct {
	m *mockFullStore
}

func (a adminStoreAdapter) ListUsers(_ context.Context, arg db.ListUsersParams) ([]db.User, error) {
	out := make([]db.User, 0, len(a.m.users))
	for _, u := range a.m.users {
		if arg.AssignedLocationCode.Valid && u.AssignedLocationCode.String != arg.AssignedLocationCode.String {
			continue
		}
		if arg.IsActive.Valid && u.IsActive != arg.IsActive.Bool {
			continue
		}
		out = append(out, u)
	}
	return out, nil
}

func (a adminStoreAdapter) UpdateUserAdmin(_ context.Context, arg db.UpdateUserAdminParams) (db.User, error) {
	u, ok := a.m.users[arg.ID]
	if !ok {
		return db.User{}, sql.ErrNoRows
	}
	u.Role = arg.Role
	u.AssignedLocationCode = arg.AssignedLocationCode
	u.IsActive = arg.IsActive
	a.m.users[arg.ID] = u
	return u, nil
}

func (a adminStoreAdapter) GetLocationByCode(_ context.Context, code string) (db.Location, error) {
	if code == "" {
		return db.Location{}, sql.ErrNoRows
	}
	// ponytail: single canned location; extend when admin handler grows location-specific behavior.
	if code == "LINE_A1" {
		return db.Location{Code: "LINE_A1", NameVi: "Chuyền A1"}, nil
	}
	return db.Location{}, sql.ErrNoRows
}

func (a adminStoreAdapter) CountAdmins(ctx context.Context) (int64, error) {
	return a.m.CountAdmins(ctx)
}

func (a adminStoreAdapter) GetUserByID(ctx context.Context, id int64) (db.User, error) {
	return a.m.GetUserByID(ctx, id)
}

func (a adminStoreAdapter) InsertAuditLog(ctx context.Context, arg db.InsertAuditLogParams) error {
	return a.m.InsertAuditLog(ctx, arg)
}

func (a adminStoreAdapter) RevokeUserRefreshTokens(ctx context.Context, userID int64) error {
	return a.m.RevokeUserRefreshTokens(ctx, userID)
}

func TestAdminHandler_ListUsers_AdminOnlyProjection(t *testing.T) {
	store := newMockFullStore()
	store.users[1] = db.User{ID: 1, Username: "admin", FullName: "Admin", Role: RoleAdmin.String(), IsActive: true, AuthSource: "LOCAL"}
	store.users[2] = db.User{ID: 2, Username: "worker1", FullName: "Worker", Role: RoleUser.String(), IsActive: true, AuthSource: "AD", PasswordHash: sql.NullString{String: "secret", Valid: true}}
	h := NewAdminHandler(adminStoreAdapter{store})

	req := httptest.NewRequest("GET", "/api/admin/users", nil)
	rr := httptest.NewRecorder()
	h.ListUsers(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	body := rr.Body.String()
	if contains(body, "password_hash") || contains(body, "pin_hash") || contains(body, "secret") {
		t.Fatal("response must never expose password_hash or pin_hash")
	}
	if !contains(body, `"worker1"`) || !contains(body, `"admin"`) {
		t.Fatal("expected both users listed")
	}
}

func TestAdminHandler_UpdateUser_RoleAndLocationValidation(t *testing.T) {
	store := newMockFullStore()
	store.users[1] = db.User{ID: 1, Username: "worker1", FullName: "Worker", Role: RoleUser.String(), IsActive: true}
	store.users[2] = db.User{ID: 2, Username: "admin1", FullName: "Admin", Role: RoleAdmin.String(), IsActive: true}
	store.users[3] = db.User{ID: 3, Username: "admin2", FullName: "Admin2", Role: RoleAdmin.String(), IsActive: true}
	h := NewAdminHandler(adminStoreAdapter{store})

	// Invalid role -> 400
	body, _ := json.Marshal(UpdateUserRequest{Role: strPtr("SUPERGOD")})
	req := patchUserRequest("1", body)
	rr := httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 invalid role, got %d", rr.Code)
	}

	// Unknown location -> 400
	body, _ = json.Marshal(UpdateUserRequest{AssignedLocationCode: strPtr("NOPE")})
	req = patchUserRequest("1", body)
	rr = httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 unknown location, got %d", rr.Code)
	}

	// Valid update: role + location + active=false
	body, _ = json.Marshal(UpdateUserRequest{Role: strPtr("LINE_LEADER"), AssignedLocationCode: strPtr("LINE_A1"), IsActive: boolPtr(false)})
	req = patchUserRequest("1", body)
	rr = httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp struct {
		Data AdminUserResponse `json:"data"`
	}
	_ = json.NewDecoder(rr.Body).Decode(&resp)
	if resp.Data.Role != RoleLineLeader.String() || resp.Data.AssignedLocationCode == nil || *resp.Data.AssignedLocationCode != "LINE_A1" || resp.Data.IsActive {
		t.Fatalf("unexpected updated user: %+v", resp.Data)
	}

	// Deactivation should have revoked refresh tokens + audit log entry
	if len(store.auditLogs) == 0 || store.auditLogs[0].Action != "ADMIN_UPDATE_USER" {
		t.Fatal("expected audit log for admin update")
	}
}

func TestAdminHandler_UpdateUser_RoleChangeRevokesSessions(t *testing.T) {
	store := newMockFullStore()
	store.users[1] = db.User{ID: 1, Username: "worker1", FullName: "Worker", Role: RoleUser.String(), IsActive: true}
	store.users[2] = db.User{ID: 2, Username: "admin1", FullName: "Admin", Role: RoleAdmin.String(), IsActive: true}
	// worker1 has an active refresh session.
	store.tokens["hash1"] = db.RefreshToken{ID: 1, UserID: 1, TokenHash: "hash1", ExpiresAt: time.Now().Add(time.Hour)}
	h := NewAdminHandler(adminStoreAdapter{store})

	body, _ := json.Marshal(UpdateUserRequest{Role: strPtr("LINE_LEADER")})
	req := patchUserRequest("1", body)
	rr := httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	for _, tkn := range store.tokens {
		if tkn.UserID == 1 && !tkn.RevokedAt.Valid {
			t.Fatal("expected role change to revoke target user's refresh tokens")
		}
	}
}

func TestAdminHandler_UpdateUser_NoRoleChangePreservesSessions(t *testing.T) {
	store := newMockFullStore()
	store.users[1] = db.User{ID: 1, Username: "worker1", FullName: "Worker", Role: RoleUser.String(), IsActive: true}
	store.users[2] = db.User{ID: 2, Username: "admin1", FullName: "Admin", Role: RoleAdmin.String(), IsActive: true}
	store.tokens["hash1"] = db.RefreshToken{ID: 1, UserID: 1, TokenHash: "hash1", ExpiresAt: time.Now().Add(time.Hour)}
	h := NewAdminHandler(adminStoreAdapter{store})

	body, _ := json.Marshal(UpdateUserRequest{AssignedLocationCode: strPtr("LINE_A1")})
	req := patchUserRequest("1", body)
	rr := httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	for _, tkn := range store.tokens {
		if tkn.UserID == 1 && tkn.RevokedAt.Valid {
			t.Fatal("expected non-role update to keep refresh tokens valid")
		}
	}
}

func TestAdminHandler_UpdateUser_SameRoleDoesNotRevokeSessions(t *testing.T) {
	store := newMockFullStore()
	store.users[1] = db.User{ID: 1, Username: "worker1", FullName: "Worker", Role: RoleUser.String(), IsActive: true}
	store.users[2] = db.User{ID: 2, Username: "admin1", FullName: "Admin", Role: RoleAdmin.String(), IsActive: true}
	store.tokens["hash1"] = db.RefreshToken{ID: 1, UserID: 1, TokenHash: "hash1", ExpiresAt: time.Now().Add(time.Hour)}
	h := NewAdminHandler(adminStoreAdapter{store})

	body, _ := json.Marshal(UpdateUserRequest{Role: strPtr("USER")})
	req := patchUserRequest("1", body)
	rr := httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	for _, tkn := range store.tokens {
		if tkn.UserID == 1 && tkn.RevokedAt.Valid {
			t.Fatal("expected assigning same role to keep refresh tokens valid")
		}
	}
}

func TestAdminHandler_UpdateUser_LastAdminProtection(t *testing.T) {
	store := newMockFullStore()
	store.users[1] = db.User{ID: 1, Username: "lastadmin", FullName: "Admin", Role: RoleAdmin.String(), IsActive: true}
	store.users[2] = db.User{ID: 2, Username: "worker1", FullName: "Worker", Role: RoleUser.String(), IsActive: true}
	h := NewAdminHandler(adminStoreAdapter{store})

	// Deactivate last admin -> 409
	body, _ := json.Marshal(UpdateUserRequest{IsActive: boolPtr(false)})
	req := patchUserRequest("1", body)
	rr := httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409 last admin deactivate, got %d", rr.Code)
	}

	// Demote last admin -> 409
	body, _ = json.Marshal(UpdateUserRequest{Role: strPtr("USER")})
	req = patchUserRequest("1", body)
	rr = httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409 last admin demote, got %d", rr.Code)
	}

	// User unchanged
	u, _ := store.GetUserByID(context.Background(), 1)
	if !u.IsActive || u.Role != RoleAdmin.String() {
		t.Fatal("last admin must remain untouched on rejection")
	}
}

func TestAdminHandler_UpdateUser_PrivilegedBoundaries(t *testing.T) {
	store := newMockFullStore()
	store.users[1] = db.User{ID: 1, Role: RoleAdmin.String(), IsActive: true}
	store.users[2] = db.User{ID: 2, Role: RoleAdmin.String(), IsActive: true}
	store.users[3] = db.User{ID: 3, Role: RoleSuperadmin.String(), IsActive: true}
	h := NewAdminHandler(adminStoreAdapter{store})

	for _, id := range []string{"2", "3"} {
		body, _ := json.Marshal(UpdateUserRequest{IsActive: boolPtr(false)})
		req := patchUserRequest(id, body)
		req = req.WithContext(context.WithValue(req.Context(), UserContextKey, store.users[1]))
		rr := httptest.NewRecorder()
		h.UpdateUser(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for privileged target %s, got %d", id, rr.Code)
		}
	}

	body, _ := json.Marshal(UpdateUserRequest{IsActive: boolPtr(false)})
	req := patchUserRequest("1", body)
	req = req.WithContext(context.WithValue(req.Context(), UserContextKey, store.users[1]))
	rr := httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for self-change, got %d", rr.Code)
	}
}

func TestAdminHandler_UpdateUser_NotFound(t *testing.T) {
	store := newMockFullStore()
	h := NewAdminHandler(adminStoreAdapter{store})
	body, _ := json.Marshal(UpdateUserRequest{IsActive: boolPtr(false)})
	req := patchUserRequest("999", body)
	rr := httptest.NewRecorder()
	h.UpdateUser(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rr.Code)
	}
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

func patchUserRequest(id string, body []byte) *http.Request {
	req := httptest.NewRequest("PATCH", "/api/admin/users/"+id, bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && bytes.Contains([]byte(haystack), []byte(needle))
}
