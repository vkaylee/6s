package issue_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// TestArchitecture_EnforceEnumComparisons ensures no Go code compares raw string literals
// for known enum values (Status, Category, Role) instead of using the defined enum constants.
func TestArchitecture_EnforceEnumComparisons(t *testing.T) {
	// Forbidden raw strings in comparisons
	forbiddenEnumStrings := map[string]string{
		"OPEN":           "issue.StatusOpen",
		"PENDING_REVIEW": "issue.StatusPendingReview",
		"CLOSED":         "issue.StatusClosed",
		"INVALID":        "issue.StatusInvalid",
		"1S":             "issue.Category1S",
		"2S":             "issue.Category2S",
		"3S":             "issue.Category3S",
		"4S":             "issue.Category4S",
		"5S":             "issue.Category5S",
		"6S":             "issue.Category6S",
		"USER":           "auth.RoleUser",
		"LINE_LEADER":    "auth.RoleLineLeader",
		"SAFETY_OFFICER": "auth.RoleSafetyOfficer",
		"ADMIN":          "auth.RoleAdmin",
	}

	rootDir := "../"
	fset := token.NewFileSet()

	err := filepath.Walk(rootDir, func(path string, _ os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}

		cleanPath := filepath.ToSlash(path)
		// Skip generated DB files and enum definition files
		if strings.Contains(cleanPath, "/db/models.go") ||
			strings.Contains(cleanPath, "/db/queries.sql.go") ||
			strings.HasSuffix(cleanPath, "issue/enums.go") ||
			strings.HasSuffix(cleanPath, "auth/role.go") ||
			strings.HasSuffix(cleanPath, "arch_enum_test.go") {
			return nil
		}

		node, parseErr := parser.ParseFile(fset, path, nil, parser.AllErrors)
		if parseErr != nil {
			t.Fatalf("failed to parse file %s: %v", path, parseErr)
		}

		ast.Inspect(node, func(n ast.Node) bool {
			binExpr, isBin := n.(*ast.BinaryExpr)
			if isBin && (binExpr.Op == token.EQL || binExpr.Op == token.NEQ) {
				checkLiteral := func(expr ast.Expr) {
					lit, ok := expr.(*ast.BasicLit)
					if ok && lit.Kind == token.STRING {
						val, unquoteErr := strconv.Unquote(lit.Value)
						if unquoteErr == nil {
							if replacement, found := forbiddenEnumStrings[val]; found {
								pos := fset.Position(lit.Pos())
								t.Errorf("%s: forbidden comparison with raw string literal %q; must use enum constant %s", pos, val, replacement)
							}
						}
					}
				}
				checkLiteral(binExpr.X)
				checkLiteral(binExpr.Y)
			}
			return true
		})

		return nil
	})

	if err != nil {
		t.Fatalf("failed to scan directory: %v", err)
	}
}
