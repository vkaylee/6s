package db

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestCreateUserJITAssignsDefaultSite(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	queries := New(sqlDB)

	user, err := queries.CreateUserJIT(context.Background(), CreateUserJITParams{
		Username: "jit-default-site",
		AdDn:     sql.NullString{String: "CN=JIT Default,DC=factory,DC=lan", Valid: true},
		FullName: "JIT Default",
		Role:     "USER",
	})
	if err != nil {
		t.Fatalf("CreateUserJIT: %v", err)
	}
	if user.SiteID <= 0 {
		t.Fatalf("expected JIT user to have a site, got %d", user.SiteID)
	}
	var defaultSiteID int64
	if err := sqlDB.QueryRowContext(context.Background(), `SELECT id FROM sites WHERE code = 'DEFAULT'`).Scan(&defaultSiteID); err != nil {
		t.Fatalf("lookup default site: %v", err)
	}
	if user.SiteID != defaultSiteID {
		t.Fatalf("expected default site %d, got %d", defaultSiteID, user.SiteID)
	}
}

func TestGetUserByADDNRoundTrip(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	queries := New(sqlDB)
	dn := sql.NullString{String: "CN=JIT DN,DC=factory,DC=lan", Valid: true}
	created, err := queries.CreateUserJIT(context.Background(), CreateUserJITParams{
		Username: "jit-dn-roundtrip", AdDn: dn, FullName: "JIT DN", Role: "USER",
	})
	if err != nil {
		t.Fatalf("CreateUserJIT: %v", err)
	}
	found, err := queries.GetUsersByADDN(context.Background(), dn.String)
	if err != nil {
		t.Fatalf("GetUsersByADDN: %v", err)
	}
	if len(found) != 1 || found[0].ID != created.ID || !found[0].AdDn.Valid || found[0].AdDn.String != dn.String {
		t.Fatalf("unexpected DN lookup result: %+v", found)
	}
}

func TestGetUsersByADDNAmbiguityIsObservable(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	queries := New(sqlDB)
	for _, row := range []struct{ username, dn string }{
		{"jit-ambiguous-a", "CN=Ambiguous,DC=factory,DC=lan"},
		{"jit-ambiguous-b", "cn=ambiguous,dc=factory,dc=lan"},
	} {
		if _, err := queries.CreateUserJIT(context.Background(), CreateUserJITParams{
			Username: row.username, AdDn: sql.NullString{String: row.dn, Valid: true}, FullName: row.username, Role: "USER",
		}); err != nil {
			t.Fatalf("CreateUserJIT %s: %v", row.username, err)
		}
	}
	rows, err := queries.GetUsersByADDN(context.Background(), "CN=AMBIGUOUS,DC=FACTORY,DC=LAN")
	if err != nil {
		t.Fatalf("GetUsersByADDN: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected both case-variant DN rows, got %d", len(rows))
	}
}
