package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"
	"time"
)

type dummyDBTX struct{}

func (d *dummyDBTX) ExecContext(context.Context, string, ...interface{}) (sql.Result, error) {
	return nil, nil
}
func (d *dummyDBTX) PrepareContext(context.Context, string) (*sql.Stmt, error) {
	return nil, nil
}
func (d *dummyDBTX) QueryContext(context.Context, string, ...interface{}) (*sql.Rows, error) {
	return nil, nil
}
func (d *dummyDBTX) QueryRowContext(context.Context, string, ...interface{}) *sql.Row {
	return nil
}

func TestPatchIssueWithTagsAtomic_UnsupportedDB(t *testing.T) {
	q := New(&dummyDBTX{})
	_, err := q.PatchIssueWithTagsAtomic(context.Background(), PatchIssueParams{ID: 1}, []string{"tag1"})
	if err == nil || !strings.Contains(err.Error(), "database does not support transactions") {
		t.Fatalf("expected unsupported transaction error, got %v", err)
	}
}

type atomicIssueStore struct {
	issue     Issue
	tags      []string
	deleteErr bool
	insertErr bool
	commits   int
	rollbacks int
}

type atomicIssueDriver struct{}

var atomicIssueTestStore *atomicIssueStore

func (atomicIssueDriver) Open(string) (driver.Conn, error) {
	if atomicIssueTestStore == nil {
		return nil, errors.New("atomic issue test store is nil")
	}
	return &atomicIssueConn{store: atomicIssueTestStore}, nil
}

func init() {
	sql.Register("issue_atomic_test", atomicIssueDriver{})
}

type atomicIssueConn struct {
	store *atomicIssueStore
	tx    *atomicIssueTx
}

func (c *atomicIssueConn) Prepare(query string) (driver.Stmt, error) {
	return &atomicIssueStmt{conn: c, query: query}, nil
}
func (c *atomicIssueConn) Close() error              { return nil }
func (c *atomicIssueConn) Begin() (driver.Tx, error) { return c.beginTx() }
func (c *atomicIssueConn) BeginTx(context.Context, *driver.TxOptions) (driver.Tx, error) {
	return c.beginTx()
}
func (c *atomicIssueConn) beginTx() (driver.Tx, error) {
	c.tx = &atomicIssueTx{
		conn:  c,
		issue: c.store.issue,
		tags:  append([]string(nil), c.store.tags...),
	}
	return c.tx, nil
}
func (c *atomicIssueConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	return c.exec(query, namedValues(args))
}
func (c *atomicIssueConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	return c.query(query, namedValues(args))
}
func (c *atomicIssueConn) exec(query string, args []driver.Value) (driver.Result, error) {
	if c.tx == nil {
		return nil, errors.New("write outside transaction")
	}
	switch {
	case strings.Contains(query, "DeleteIssueTags"):
		if c.store.deleteErr {
			return nil, errors.New("delete issue tags")
		}
		c.tx.tags = nil
	case strings.Contains(query, "InsertIssueTag"):
		if c.store.insertErr {
			return nil, errors.New("insert issue tag")
		}
		c.tx.tags = append(c.tx.tags, args[1].(string))
	default:
		return nil, errors.New("unexpected exec query")
	}
	return driver.RowsAffected(1), nil
}
func (c *atomicIssueConn) query(query string, args []driver.Value) (driver.Rows, error) {
	if c.tx == nil || !strings.Contains(query, "PatchIssue") {
		return nil, errors.New("unexpected query")
	}
	if category, ok := args[1].(string); ok {
		c.tx.issue.Category = category
	}
	c.tx.issue.Version++
	return &atomicIssueRows{values: issueValues(c.tx.issue)}, nil
}

func namedValues(args []driver.NamedValue) []driver.Value {
	values := make([]driver.Value, len(args))
	for i := range args {
		values[i] = args[i].Value
	}
	return values
}

type atomicIssueStmt struct {
	conn  *atomicIssueConn
	query string
}

func (s *atomicIssueStmt) Close() error  { return nil }
func (s *atomicIssueStmt) NumInput() int { return -1 }
func (s *atomicIssueStmt) Exec(args []driver.Value) (driver.Result, error) {
	return s.conn.exec(s.query, args)
}
func (s *atomicIssueStmt) Query(args []driver.Value) (driver.Rows, error) {
	return s.conn.query(s.query, args)
}

type atomicIssueTx struct {
	conn  *atomicIssueConn
	issue Issue
	tags  []string
}

func (tx *atomicIssueTx) Commit() error {
	tx.conn.store.issue = tx.issue
	tx.conn.store.tags = append([]string(nil), tx.tags...)
	tx.conn.store.commits++
	tx.conn.tx = nil
	return nil
}
func (tx *atomicIssueTx) Rollback() error {
	tx.conn.store.rollbacks++
	tx.conn.tx = nil
	return nil
}

type atomicIssueRows struct {
	values []driver.Value
	read   bool
}

func (r *atomicIssueRows) Columns() []string {
	columns := make([]string, len(r.values))
	for i := range columns {
		columns[i] = "column"
	}
	return columns
}
func (r *atomicIssueRows) Close() error { return nil }
func (r *atomicIssueRows) Next(dest []driver.Value) error {
	if r.read {
		return io.EOF
	}
	r.read = true
	copy(dest, r.values)
	return nil
}

func issueValues(issue Issue) []driver.Value {
	return []driver.Value{
		issue.ID, issue.ClientUuid, issue.Version, issue.SiteID, issue.CreatorID,
		nil, nil, nil, issue.Category, issue.CauseType, issue.VisibilityClass,
		issue.LocationCode, nil, nil, issue.PhotoBefore, nil, nil, nil,
		issue.Status, issue.CreatedAt, nil, nil,
	}
}

func TestPatchIssueWithTagsAtomic_RollsBackAndCommits(t *testing.T) {
	baseIssue := Issue{
		ID: 1, ClientUuid: "client-1", Version: 3, SiteID: 1, CreatorID: 10,
		Category: "1S", CauseType: "MANUAL", VisibilityClass: "SITE_PUBLIC",
		LocationCode: "LINE_A1", PhotoBefore: "before.jpg", Status: "OPEN",
		CreatedAt: time.Now(),
	}
	for _, tc := range []struct {
		name      string
		deleteErr bool
		insertErr bool
		wantError bool
		wantTags  []string
	}{
		{name: "delete failure", deleteErr: true, wantError: true, wantTags: []string{"old"}},
		{name: "insert failure", insertErr: true, wantError: true, wantTags: []string{"old"}},
		{name: "commit", wantTags: []string{"new"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			atomicIssueTestStore = &atomicIssueStore{
				issue: baseIssue, tags: []string{"old"}, deleteErr: tc.deleteErr, insertErr: tc.insertErr,
			}
			dbConn, err := sql.Open("issue_atomic_test", "")
			if err != nil {
				t.Fatal(err)
			}
			defer dbConn.Close()
			q := New(dbConn)
			patch := PatchIssueParams{ID: 1, Category: sql.NullString{String: "2S", Valid: true}}
			updated, err := q.PatchIssueWithTagsAtomic(context.Background(), patch, []string{"new"})
			if tc.wantError && err == nil {
				t.Fatal("expected transaction failure")
			}
			if !tc.wantError && err != nil {
				t.Fatalf("unexpected transaction failure: %v", err)
			}
			if tc.wantError {
				if got := atomicIssueTestStore.issue; got.Category != baseIssue.Category || got.Version != baseIssue.Version {
					t.Fatalf("issue committed after failure: before=%+v after=%+v", baseIssue, got)
				}
				if atomicIssueTestStore.commits != 0 || atomicIssueTestStore.rollbacks != 1 {
					t.Fatalf("unexpected transaction counts: commits=%d rollbacks=%d", atomicIssueTestStore.commits, atomicIssueTestStore.rollbacks)
				}
			} else {
				if updated.Category != patch.Category.String || updated.Version != baseIssue.Version+1 {
					t.Fatalf("unexpected returned issue: %+v", updated)
				}
				if atomicIssueTestStore.commits != 1 || atomicIssueTestStore.rollbacks != 0 {
					t.Fatalf("unexpected transaction counts: commits=%d rollbacks=%d", atomicIssueTestStore.commits, atomicIssueTestStore.rollbacks)
				}
			}
			if got := atomicIssueTestStore.tags; len(got) != len(tc.wantTags) || got[0] != tc.wantTags[0] {
				t.Fatalf("unexpected tags: want=%v got=%v", tc.wantTags, got)
			}
		})
	}
}
