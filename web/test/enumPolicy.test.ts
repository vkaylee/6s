import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Collect all ts/tsx files under dir
function getAllSourceFiles(dir: string): string[] {
  let results: string[] = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getAllSourceFiles(filePath));
    } else if (/\.(tsx?)$/.test(file)) {
      results.push(filePath);
    }
  }
  return results;
}

describe("Frontend Architecture: Enforce Enum Comparisons", () => {
  const forbiddenEnumLiterals: Record<string, string> = {
    OPEN: "IssueStatus.OPEN",
    PENDING_REVIEW: "IssueStatus.PENDING_REVIEW",
    CLOSED: "IssueStatus.CLOSED",
    INVALID: "IssueStatus.INVALID",
    "1S": "IssueCategory.S1",
    "2S": "IssueCategory.S2",
    "3S": "IssueCategory.S3",
    "4S": "IssueCategory.S4",
    "5S": "IssueCategory.S5",
    "6S": "IssueCategory.S6",
    USER: "UserRole.USER",
    LINE_LEADER: "UserRole.LINE_LEADER",
    SAFETY_OFFICER: "UserRole.SAFETY_OFFICER",
    ADMIN: "UserRole.ADMIN",
  };

  it("ensures no code compares raw string literals for Status, Category, or Role", () => {
    const srcDir = join(import.meta.dir, "../src");
    const testDir = join(import.meta.dir, "../test");
    const allFiles = [...getAllSourceFiles(srcDir), ...getAllSourceFiles(testDir)];

    const violations: { file: string; line: number; text: string; expected: string }[] = [];

    for (const filePath of allFiles) {
      // Exclude the enum definition file itself and this architecture test file
      if (
        filePath.endsWith("types/index.ts") ||
        filePath.endsWith("enumPolicy.test.ts") ||
        filePath.endsWith("i18n/index.ts") ||
        filePath.includes("i18n/locales")
      ) {
        continue;
      }

      const content = readFileSync(filePath, "utf-8");
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      function visit(node: ts.Node) {
        if (ts.isBinaryExpression(node)) {
          const op = node.operatorToken.kind;
          const isComparison =
            op === ts.SyntaxKind.EqualsEqualsToken ||
            op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            op === ts.SyntaxKind.ExclamationEqualsToken ||
            op === ts.SyntaxKind.ExclamationEqualsEqualsToken;

          if (isComparison) {
            const checkOperand = (expr: ts.Expression) => {
              if (ts.isStringLiteral(expr)) {
                const val = expr.text;
                if (forbiddenEnumLiterals[val]) {
                  const { line } = sourceFile.getLineAndCharacterOfPosition(expr.getStart());
                  violations.push({
                    file: filePath.replace(/^.*?\/web\//, "web/"),
                    line: line + 1,
                    text: expr.getText(sourceFile),
                    expected: forbiddenEnumLiterals[val],
                  });
                }
              }
            };
            checkOperand(node.left);
            checkOperand(node.right);
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    expect(violations).toEqual([]);
  });
});
