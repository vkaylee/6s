package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestCreateLocationDefaultSite(t *testing.T) {
	sqlDB := newSetupTestDB(t)
	ctx := context.Background()
	queries := New(sqlDB)
	params := CreateLocationParams{
		Code: "NEW_LOCATION", NameVi: "New location", QrCode: "LOC:NEW_LOCATION",
	}

	location, err := queries.CreateLocation(ctx, params)
	if err != nil {
		t.Fatalf("create location with the existing API fields: %v", err)
	}
	var siteCode string
	if err := sqlDB.QueryRowContext(ctx, `SELECT s.code FROM locations l JOIN sites s ON s.id = l.site_id WHERE l.code = $1`, params.Code).Scan(&siteCode); err != nil {
		t.Fatalf("read persisted location site: %v", err)
	}
	if siteCode != "DEFAULT" || !location.IsActive {
		t.Fatalf("expected active location in DEFAULT site, got site %q, active %v", siteCode, location.IsActive)
	}

	for _, field := range []string{"code", "qr_code"} {
		t.Run("duplicate_"+field, func(t *testing.T) {
			duplicate := params
			if field == "code" {
				duplicate.QrCode = "LOC:OTHER_LOCATION"
			} else {
				duplicate.Code = "OTHER_LOCATION"
			}
			_, err := queries.CreateLocation(ctx, duplicate)
			var pgErr *pgconn.PgError
			if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
				t.Fatalf("expected unique violation for duplicate %s, got %v", field, err)
			}
		})
	}
	var count int
	if err := sqlDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM locations WHERE code IN ($1, $2)`, params.Code, "OTHER_LOCATION").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("duplicate attempts must not persist additional locations, got %d", count)
	}
}
