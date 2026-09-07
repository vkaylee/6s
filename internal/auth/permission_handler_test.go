package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"6s/internal/db"
)
type mockPermissionStore struct {
	permissions []db.Permission
	pairs       []db.RolePermission
	auditLogs   []db.InsertAuditLogParams
}

func (m *mockPermissionStore) ListPermissions(_ context.Context) ([]db.Permission, error) {
	return m.permissions, nil
}

func (m *mockPermissionStore) ListRolePermissions(_ context.Context) ([]db.RolePermission, error) {
	return m.pairs, nil
}

func (m *mockPermissionStore) ReplaceRolePermissions(_ context.Context, arg db.ReplaceRolePermissionsParams) error {
	out := m.pairs[:0]
	for _, pair := range m.pairs {
		if pair.Role != arg.Role {
			out = append(out, pair)
		}
	}
	for _, code := range arg.Column2 {
		out = append(out, db.RolePermission{Role: arg.Role, PermissionCode: code})
	}
	m.pairs = out
	return nil
}


func (m *mockPermissionStore) InsertAuditLog(_ context.Context, arg db.InsertAuditLogParams) error {
	m.auditLogs = append(m.auditLogs, arg)
	return nil
}

func catalogFixture() []db.Permission {
	return []db.Permission{
		{Code: PermissionIssueCloseOwn, Description: "Close own issues", IsSystem: true},
		{Code: PermissionIssueViewAll, Description: "View all issues", IsSystem: true},
		{Code: PermissionUserManage, Description: "Manage users", IsSystem: true},
		{Code: PermissionManage, Description: "Manage permissions", IsSystem: true},
	}
}

func rolePermissionsFixture() []db.RolePermission {
	return []db.RolePermission{
		{Role: "USER", PermissionCode: PermissionIssueCloseOwn},
		{Role: "ADMIN", PermissionCode: PermissionUserManage},
		{Role: "ADMIN", PermissionCode: PermissionManage},
	}
}

func permissionRequest(t *testing.T, method, target string, body []byte, role string) (*httptest.ResponseRecorder, *mockPermissionStore) {
	t.Helper()
	store := &mockPermissionStore{permissions: catalogFixture(), pairs: rolePermissionsFixture()}
	handler := NewPermissionHandler(store)
	var req *http.Request
	if body == nil {
		req = httptest.NewRequest(method, target, nil)
	} else {
		req = httptest.NewRequest(method, target, bytes.NewReader(body))
	}
	ctx := chi.NewRouteContext()
	parts := strings.Split(strings.Trim(target, "/"), "/")
	if len(parts) >= 5 { ctx.URLParams.Add("role", parts[3]) }
	req = req.WithContext(context.WithValue(context.WithValue(req.Context(), UserContextKey, db.User{ID: 7, Role: role}), chi.RouteCtxKey, ctx))
	rr := httptest.NewRecorder()
	if method == http.MethodGet { handler.List(rr, req) } else { handler.UpdateRole(rr, req) }
	return rr, store
}

func TestPermissionHandler_List(t *testing.T) {
	rr, _ := permissionRequest(t, http.MethodGet, "/api/admin/permissions", nil, "ADMIN")
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var body struct {
		Data permissionsResponse `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if len(body.Data.Permissions) != 4 || len(body.Data.Roles) != 4 {
		t.Fatalf("unexpected catalog size: %d permissions, %d roles", len(body.Data.Permissions), len(body.Data.Roles))
	}
	if body.Data.Permissions[0].Code == "" || body.Data.Permissions[0].Description == "" {
		t.Fatalf("permission projection missing code/description: %+v", body.Data.Permissions[0])
	}
	for _, roleRow := range body.Data.Roles {
		if roleRow.Role == "ADMIN" {
			if len(roleRow.Permissions) != 2 {
				t.Fatalf("expected ADMIN to hold 2 seeded permissions, got %v", roleRow.Permissions)
			}
			sort.Strings(roleRow.Permissions)
		}
	}
}

func TestPermissionHandler_UpdateRole(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"permissions": []string{PermissionIssueCloseOwn, PermissionIssueViewAll}})
	rr, store := permissionRequest(t, http.MethodPut, "/api/admin/roles/USER/permissions", payload, "ADMIN")
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	updated := 0
	for _, pair := range store.pairs {
		if pair.Role == "USER" {
			updated++
		}
	}
	if updated != 2 {
		t.Fatalf("expected USER to have 2 permissions, got %d", updated)
	}
	if len(store.auditLogs) != 1 || store.auditLogs[0].Action != "ADMIN_UPDATE_ROLE_PERMISSIONS" {
		t.Fatalf("expected audit log for mutation, got %+v", store.auditLogs)
	}
}

func TestPermissionHandler_RejectsInvalidPermission(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"permissions": []string{"issue:nonexistent"}})
	rr, store := permissionRequest(t, http.MethodPut, "/api/admin/roles/USER/permissions", payload, "ADMIN")
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
	if len(store.pairs) != 3 {
		t.Fatalf("expected untouched store on rejection, got %+v", store.pairs)
	}
}

func TestPermissionHandler_RejectsInvalidRole(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"permissions": []string{}})
	rr, _ := permissionRequest(t, http.MethodPut, "/api/admin/roles/SUPERUSER/permissions", payload, "ADMIN")
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestPermissionHandler_AdminLockoutGuard(t *testing.T) {
	for _, missing := range []string{PermissionManage, PermissionUserManage} {
		remaining := []string{}
		for _, code := range []string{PermissionManage, PermissionUserManage} {
			if code != missing {
				remaining = append(remaining, code)
			}
		}
		payload, _ := json.Marshal(map[string]any{"permissions": remaining})
		rr, store := permissionRequest(t, http.MethodPut, "/api/admin/roles/ADMIN/permissions", payload, "ADMIN")
		if rr.Code != http.StatusConflict {
			t.Fatalf("expected 409 for missing %s, got %d", missing, rr.Code)
		}
		if len(store.pairs) != 3 {
			t.Fatalf("expected ADMIN permissions untouched, got %+v", store.pairs)
		}
	}
}

func TestPermissionHandler_SystemPermissionsProtected(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"permissions": []string{PermissionManage, PermissionUserManage}})
	rr, store := permissionRequest(t, http.MethodPut, "/api/admin/roles/ADMIN/permissions", payload, "ADMIN")
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409 when system permissions are dropped, got %d", rr.Code)
	}
	if len(store.pairs) != 3 {
		t.Fatalf("expected untouched store, got %+v", store.pairs)
	}
}

func TestPermissionHandler_RequiresPermissionManage(t *testing.T) {
	next := RequirePermission(PermissionManage)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	ctxUser := context.WithValue(context.Background(), UserContextKey, db.User{ID: 1, Role: "USER"})
	forbidden := httptest.NewRequest(http.MethodGet, "/x", nil).WithContext(ctxUser)
	rr := httptest.NewRecorder()
	next.ServeHTTP(rr, forbidden)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without permission, got %d", rr.Code)
	}

	allowedCtx := withPermissions(ctxUser, []string{PermissionManage})
	allowed := httptest.NewRequest(http.MethodGet, "/x", nil).WithContext(allowedCtx)
	rrOK := httptest.NewRecorder()
	next.ServeHTTP(rrOK, allowed)
	if rrOK.Code != http.StatusOK {
		t.Fatalf("expected 200 with permission, got %d", rrOK.Code)
	}
}

func TestPermissionHandler_HasPermissionFailsClosed(t *testing.T) {
	if HasPermission(context.Background(), PermissionManage) {
		t.Fatal("empty context must fail closed")
	}
	if !HasPermission(withPermissions(context.Background(), []string{PermissionManage}), PermissionManage) {
		t.Fatal("expected permission present")
	}
	if HasPermission(withPermissions(context.Background(), []string{PermissionManage}), "") {
		t.Fatal("empty code must fail closed")
	}
}
