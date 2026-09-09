package auth

import (
	"context"
	"testing"
)

func TestResolveCapabilities(t *testing.T) {
	if got := ResolveCapabilities(RoleUser.String(), []string{PermissionIssueCreate}); len(got) != 1 || got[0] != PermissionIssueCreate {
		t.Fatalf("expected explicit user capabilities, got %v", got)
	}
	got := ResolveCapabilities(RoleSuperadmin.String(), []string{PermissionIssueCreate})
	if len(got) != len(CatalogCapabilities) {
		t.Fatalf("expected SUPERADMIN catalog, got %v", got)
	}
	for _, capability := range CatalogCapabilities {
		found := false
		for _, value := range got {
			if value == capability {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("SUPERADMIN missing capability %q", capability)
		}
	}
}

func TestHasPermissionFailsClosedWithoutContext(t *testing.T) {
	if HasPermission(context.TODO(), PermissionUserManage) {
		t.Fatal("missing permission context must deny")
	}
}
