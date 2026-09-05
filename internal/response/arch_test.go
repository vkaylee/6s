package response_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestArchitecture_EnforceAppErrorPolicy guards that no handler or service in internal/
// writes errors directly bypassing apperror and response.AppError.
func TestArchitecture_EnforceAppErrorPolicy(t *testing.T) {
	// Root of internal directory
	rootDir := "../"

	fset := token.NewFileSet()

	err := filepath.Walk(rootDir, func(path string, _ os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		// Skip tests, non-go files, and response package itself
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		cleanPath := filepath.ToSlash(path)
		if strings.Contains(cleanPath, "/response/") || strings.HasSuffix(cleanPath, "/response.go") || strings.Contains(cleanPath, "/apperror/") || strings.Contains(cleanPath, "/i18n/") {
			return nil
		}

		node, parseErr := parser.ParseFile(fset, path, nil, parser.AllErrors)
		if parseErr != nil {
			t.Fatalf("failed to parse file %s: %v", path, parseErr)
		}

		ast.Inspect(node, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}

			sel, isSel := call.Fun.(*ast.SelectorExpr)
			if !isSel {
				return true
			}

			ident, isIdent := sel.X.(*ast.Ident)
			if !isIdent {
				return true
			}

			// 1. Forbid http.Error in internal packages (must use response.AppError)
			if ident.Name == "http" && sel.Sel.Name == "Error" {
				pos := fset.Position(call.Pos())
				t.Errorf("%s: forbidden call to http.Error; must use response.AppError with apperror", pos)
			}

			// 2. Forbid any direct calls to deprecated response helpers if anyone attempts to reintroduce them
			forbiddenResponseFuncs := map[string]bool{
				"BadRequest":          true,
				"Unauthorized":        true,
				"Forbidden":           true,
				"NotFound":            true,
				"Conflict":            true,
				"InternalServerError": true,
				"Error":               true,
			}

			if ident.Name == "response" && forbiddenResponseFuncs[sel.Sel.Name] {
				pos := fset.Position(call.Pos())
				t.Errorf("%s: forbidden call to response.%s; must use response.AppError(w, r, apperror...)", pos, sel.Sel.Name)
			}

			return true
		})

		return nil
	})

	if err != nil {
		t.Fatalf("failed to scan directory: %v", err)
	}
}
