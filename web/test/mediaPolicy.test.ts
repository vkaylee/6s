import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export interface MediaViolation {
  file: string;
  line: number;
  text: string;
  reason: string;
}

const ALLOWED_LOCAL_IMG_SRC_IDENTIFIERS: Record<string, true> = {
  localPhotoUrl: true,
  preview: true,
  previewBefore: true,
  previewDetail: true,
  previewUrl: true,
};

function getAllSourceFiles(dir: string): string[] {
  let results: string[] = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getAllSourceFiles(filePath));
    } else if (/\.tsx?$/.test(file)) {
      results.push(filePath);
    }
  }
  return results;
}

export function findMediaViolations(filePath: string, content: string): MediaViolation[] {
  if (filePath.endsWith("components/AuthenticatedImage.tsx")) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const violations: MediaViolation[] = [];

  function checkSrcAttribute(jsxElement: ts.JsxOpeningLikeElement) {
    const srcAttr = jsxElement.attributes.properties.find(
      (prop) => ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name) && prop.name.text === "src",
    ) as ts.JsxAttribute | undefined;

    if (!srcAttr?.initializer) return;

    const { line } = sourceFile.getLineAndCharacterOfPosition(srcAttr.getStart(sourceFile));
    const rawText = srcAttr.getText(sourceFile);

    // Case 1: String literal with server endpoint
    if (ts.isStringLiteral(srcAttr.initializer)) {
      const val = srcAttr.initializer.text;
      if (val.includes("/api/") || val.includes("/media/")) {
        violations.push({
          file: filePath,
          line: line + 1,
          text: rawText,
          reason:
            "Server media endpoint rendered directly in native <img>. Use <AuthenticatedImage> instead.",
        });
      }
      return;
    }

    // Case 2: JSX expression container
    if (ts.isJsxExpression(srcAttr.initializer) && srcAttr.initializer.expression) {
      const expr = srcAttr.initializer.expression;
      const exprText = expr.getText(sourceFile);

      if (exprText.includes("resolvePhotoUrl")) {
        violations.push({
          file: filePath,
          line: line + 1,
          text: rawText,
          reason:
            "resolvePhotoUrl(...) passed directly to native <img>. Use <AuthenticatedImage imageUrl={...}> instead.",
        });
        return;
      }

      if (/photo_(before|after|detail)/.test(exprText)) {
        violations.push({
          file: filePath,
          line: line + 1,
          text: rawText,
          reason:
            "Issue photo field passed directly to native <img>. Use <AuthenticatedImage> with resolvePhotoUrl.",
        });
        return;
      }

      const checkIdentifierOrExpression = (target: ts.Expression) => {
        if (ts.isIdentifier(target)) {
          if (!ALLOWED_LOCAL_IMG_SRC_IDENTIFIERS[target.text]) {
            violations.push({
              file: filePath,
              line: line + 1,
              text: rawText,
              reason: `Untrusted image source "${target.text}" on native <img>. Protected server images must use <AuthenticatedImage>.`,
            });
          }
          return;
        }
        if (ts.isConditionalExpression(target)) {
          checkIdentifierOrExpression(target.whenTrue);
          checkIdentifierOrExpression(target.whenFalse);
          return;
        }
        if (ts.isBinaryExpression(target)) {
          checkIdentifierOrExpression(target.left);
          checkIdentifierOrExpression(target.right);
          return;
        }
      };

      checkIdentifierOrExpression(expr);
    }
  }

  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sourceFile) === "img") {
        checkSrcAttribute(node);
      }
    } else if (ts.isJsxElement(node)) {
      if (node.openingElement.tagName.getText(sourceFile) === "img") {
        checkSrcAttribute(node.openingElement);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

describe("Frontend Architecture: Media Loading Policy Guard", () => {
  it("forbids raw <img> for server-authenticated photos across all web/src source files", () => {
    const srcDir = join(import.meta.dir, "../src");
    const allFiles = getAllSourceFiles(srcDir);
    const allViolations: MediaViolation[] = [];

    for (const filePath of allFiles) {
      const content = readFileSync(filePath, "utf-8");
      const fileViolations = findMediaViolations(filePath, content);
      allViolations.push(...fileViolations);
    }

    expect(allViolations).toEqual([]);
  });

  describe("policy guard detector verification", () => {
    it("flags resolvePhotoUrl inside native <img>", () => {
      const sample = `export const Card = () => <img src={resolvePhotoUrl(issue.photo_before)} alt="demo" />;`;
      const violations = findMediaViolations("sample.tsx", sample);
      expect(violations.length).toBe(1);
      expect(violations[0].reason).toContain("resolvePhotoUrl");
    });

    it("flags raw server media URL string literal inside native <img>", () => {
      const sample = `export const Card = () => <img src="/api/issues/1/media/before/photo.jpg" alt="demo" />;`;
      const violations = findMediaViolations("sample.tsx", sample);
      expect(violations.length).toBe(1);
      expect(violations[0].reason).toContain("Server media endpoint");
    });

    it("flags issue photo property directly on native <img>", () => {
      const sample = `export const Card = () => <img src={issue.photo_before} alt="demo" />;`;
      const violations = findMediaViolations("sample.tsx", sample);
      expect(violations.length).toBe(1);
      expect(violations[0].reason).toContain("Issue photo field");
    });

    it("allows AuthenticatedImage usage", () => {
      const sample = `export const Card = () => <AuthenticatedImage imageUrl={resolvePhotoUrl(issue.photo_before)} alt="demo" />;`;
      const violations = findMediaViolations("sample.tsx", sample);
      expect(violations).toEqual([]);
    });

    it("allows local preview identifiers on native <img>", () => {
      const sample = `export const Card = () => (
        <div>
          <img src={preview} alt="local preview" />
          <img src={localPhotoUrl} alt="conflict local" />
        </div>
      );`;
      const violations = findMediaViolations("sample.tsx", sample);
      expect(violations).toEqual([]);
    });

    it("flags unwhitelisted identifiers on native <img>", () => {
      const sample = `export const Card = () => <img src={remoteUnknownUrl} alt="unknown" />;`;
      const violations = findMediaViolations("sample.tsx", sample);
      expect(violations.length).toBe(1);
      expect(violations[0].reason).toContain("Untrusted image source");
    });
  });
});
