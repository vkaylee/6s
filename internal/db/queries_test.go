package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"
)

var mockReturnEOF = false
const (
	category1S = "1S"
	statusOpen = "OPEN"
)

type mockDBStmt struct {
	query string
}

func (s *mockDBStmt) Close() error  { return nil }
func (s *mockDBStmt) NumInput() int { return -1 }
func (s *mockDBStmt) Exec(_ []driver.Value) (driver.Result, error) {
	return driver.RowsAffected(1), nil
}
func (s *mockDBStmt) Query(_ []driver.Value) (driver.Rows, error) {
	if mockReturnEOF {
		return &mockDBRows{read: true}, nil
	}
	vals := rowValuesForQuery(s.query)
	return &mockDBRows{values: vals}, nil
}

type mockDBRows struct {
	values []driver.Value
	read   bool
}

func (r *mockDBRows) Columns() []string {
	if len(r.values) == 0 {
		return []string{"col0"}
	}
	cols := make([]string, len(r.values))
	for i := range r.values {
		cols[i] = fmt.Sprintf("col%d", i)
	}
	return cols
}

func (r *mockDBRows) Close() error { return nil }

func (r *mockDBRows) Next(dest []driver.Value) error {
	if r.read || len(r.values) == 0 {
		return io.EOF
	}
	r.read = true
	copy(dest, r.values)
	return nil
}

type mockDBConn struct{}

func (m *mockDBConn) Prepare(query string) (driver.Stmt, error) {
	return &mockDBStmt{query: query}, nil
}
func (m *mockDBConn) Close() error              { return nil }
func (m *mockDBConn) Begin() (driver.Tx, error) { return nil, nil }

type mockDBDriver struct{}

func (d *mockDBDriver) Open(_ string) (driver.Conn, error) {
	return &mockDBConn{}, nil
}

func init() {
	sql.Register("mock_db_driver", &mockDBDriver{})
}

func rowValuesForQuery(query string) []driver.Value {
	now := time.Now()
	switch {
	case strings.Contains(query, "ListIssuesFiltered"):
		return []driver.Value{
			int64(1), "uuid", int32(1), int64(1), nil, "1S", "CONDITION", "LOC1", nil, nil,
			"before.jpg", nil, nil, nil, "OPEN", now, nil, nil,
			int64(1), "LOC1", "creator", "Creator A", nil, nil,
		}
	case strings.Contains(query, "listIssuesForExport"):
		return []driver.Value{
			int64(1), "uuid", int32(1), "Creator A", nil, "1S", "CONDITION", "LOC1", "Loc Vi",
			nil, nil, "before.jpg", nil, nil, nil, "OPEN", now, nil, nil, []byte("{}"),
		}
	case strings.Contains(query, "listScoreLogsByIssue") || strings.Contains(query, "listScoreLogsByTargetSince"):
		return []driver.Value{int64(1), int64(1), "USER", "1", "rule1", int32(5), now, nil, nil, nil}
	case strings.Contains(query, "listTagsForIssue"):
		return []driver.Value{"tag1", "1S", "Label Vi", "Label Zh", "Label En"}
	case strings.Contains(query, "listUserActiveSessions"):
		return []driver.Value{int64(1), nil, now, now}
	case strings.Contains(query, "listOpenOverdueIssues"):
		return []driver.Value{int64(1), now, "LOC1", "1S"}
	case strings.Contains(query, "claimOutboxTasks"):
		return []driver.Value{int64(1), int64(1), "EVT", "WXPUSHER", []byte(`{}`), "PENDING", int32(0), int32(3), nil, now, now, nil}
	case strings.Contains(query, "getScoringRules"):
		return []driver.Value{int64(1), "s1_penalty", int32(5), nil}
	case strings.Contains(query, "listLocations") || strings.Contains(query, "listAllLocations"):
		return []driver.Value{int64(1), "LOC1", "Vi", "Zh", "En", "QR1", true, now}
	case strings.Contains(query, "listTags") || strings.Contains(query, "listAllTags"):
		return []driver.Value{int64(1), "T1", "Vi", "Zh", "En", "1S", int32(10), true, true}
	case strings.Contains(query, "listScoreLogsSince"):
		return []driver.Value{int64(1), int64(1), "USER", "1", "rule1", int32(5), now, nil}
	case strings.Contains(query, "listUsers"):
		return []driver.Value{int64(1), "admin", nil, "LOCAL", nil, nil, nil, "Admin", nil, "SUPERADMIN", nil, nil, true, now, nil}
	case strings.Contains(query, "listAllActivePhotoBasenames"):
		return []driver.Value{"photo.jpg"}
	case strings.Contains(query, "getCategoryBreakdown"):
		return []driver.Value{"1S", int64(10), float64(25.0)}
	case strings.Contains(query, "getIssueTrends"):
		return []driver.Value{now, int64(3), int64(2)}
	case strings.Contains(query, "getReporterLeaderboardInMonth"):
		return []driver.Value{int64(1), "User A", int64(100), int64(20), int64(5)}
	case strings.Contains(query, "getTopViolatedTags"):
		return []driver.Value{"T1", "Vi", "Zh", "En", "1S", int64(15)}
	case strings.Contains(query, "countAdmins") || strings.Contains(query, "countIssuesFiltered") ||
		strings.Contains(query, "countOpenIssuesByLocation") || strings.Contains(query, "countOverdueIssuesByLocation") ||
		strings.Contains(query, "getLocationScoreSumInWeek"):
		return []driver.Value{int64(5)}
	case strings.Contains(query, "getReportKPISummary"):
		return []driver.Value{int64(10), int64(2), int64(1), int64(7), int64(0), int64(1), int64(0), float64(70.0)}
	case strings.Contains(query, "getADConfig") || strings.Contains(query, "upsertADConfig"):
		return []driver.Value{int64(1), true, "ad.lan", int32(636), true, "dc=lan", "cn=admin", nil, nil, now, nil}
	case strings.Contains(query, "getAIConfig") || strings.Contains(query, "upsertAIConfig"):
		return []driver.Value{int64(1), true, "http://ai.lan", nil, "gpt", "gpt", "gpt", "gpt", now, nil}
	case strings.Contains(query, "getNotificationConfig") || strings.Contains(query, "upsertNotificationConfig"):
		return []driver.Value{int32(1), true, "token", "url", "base", now, nil}
	case strings.Contains(query, "getLastCronTaskLog") || strings.Contains(query, "insertCronTaskLog"):
		return []driver.Value{int64(1), "task1", now, "SUCCESS", nil}
	case strings.Contains(query, "getRefreshTokenByHash") || strings.Contains(query, "createRefreshToken"):
		return []driver.Value{int64(1), int64(1), "hash", nil, now, nil, now}
	case strings.Contains(query, "getScoringRuleByKey") || strings.Contains(query, "upsertScoringRule"):
		return []driver.Value{int64(1), "key", int32(5), nil}
	case strings.Contains(query, "getUserBy") || strings.Contains(query, "createUser") || strings.Contains(query, "createLocalAdmin") || strings.Contains(query, "updateUser"):
		return []driver.Value{int64(1), "admin", nil, "LOCAL", nil, nil, nil, "Admin", nil, "SUPERADMIN", nil, nil, true, now, nil}
	case strings.Contains(query, "getLocationByCode") || strings.Contains(query, "createLocation") || strings.Contains(query, "updateLocation"):
		return []driver.Value{int64(1), "LOC1", "Vi", "Zh", "En", "QR1", true, now}
	case strings.Contains(query, "upsertTag") || strings.Contains(query, "updateTagActiveStatus"):
		return []driver.Value{int64(1), "T1", "Vi", "Zh", "En", "1S", int32(10), true, true}
	case strings.Contains(query, "createOutboxEntry"):
		return []driver.Value{int64(1), int64(1), "EVT", "WXPUSHER", []byte(`{}`), "PENDING", int32(0), int32(3), nil, now, now, nil}
	default:
		// Issue default
		return []driver.Value{
			int64(1), "uuid", int32(1), int64(1), nil, "1S", "CONDITION", "LOC1", nil, nil,
			"before.jpg", nil, nil, nil, "OPEN", now, nil, nil,
		}
	}
}
func TestQueries_ListIssuesFiltered(t *testing.T) {
	sqlDB, err := sql.Open("mock_db_driver", "")
	if err != nil {
		t.Fatalf("open mock db: %v", err)
	}
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close mock db: %v", err)
		}
	})

	q := New(sqlDB)
	rows, err := q.ListIssuesFiltered(context.Background(), ListIssuesFilteredParams{})
	if len(rows) != 1 || rows[0].ID != 1 || rows[0].Category != category1S {
		t.Fatalf("unexpected rows: %+v", rows)
	}
}

func TestQueries_GetIssueByID(t *testing.T) {
	sqlDB, err := sql.Open("mock_db_driver", "")
	if err != nil {
		t.Fatalf("open mock db: %v", err)
	}
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close mock db: %v", err)
		}
	})

	issueRow, err := New(sqlDB).GetIssueByID(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetIssueByID: %v", err)
	}
	if issueRow.ID != 1 || issueRow.Status != statusOpen {
		t.Fatalf("unexpected issue: %+v", issueRow)
	}
}

func TestQueries_EmptyList(t *testing.T) {
	mockReturnEOF = true
	t.Cleanup(func() { mockReturnEOF = false })
	sqlDB, err := sql.Open("mock_db_driver", "")
	if err != nil {
		t.Fatalf("open mock db: %v", err)
	}
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close mock db: %v", err)
		}
	})

	rows, err := New(sqlDB).ListTags(context.Background())
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected empty result, got %+v", rows)
	}
}

func TestQueries_Write(t *testing.T) {
	sqlDB, err := sql.Open("mock_db_driver", "")
	if err != nil {
		t.Fatalf("open mock db: %v", err)
	}
	t.Cleanup(func() {
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close mock db: %v", err)
		}
	})

	if err := New(sqlDB).DeleteIssueTags(context.Background(), 1); err != nil {
		t.Fatalf("DeleteIssueTags: %v", err)
	}
}
