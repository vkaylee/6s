import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { GlobalDialog } from "../src/components/GlobalDialog.tsx";
import { modalDialog, useDialogStore } from "../src/store/dialogStore.ts";

function getAllSourceFiles(dir: string): string[] {
  let results: string[] = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getAllSourceFiles(filePath));
    } else if (/\.(tsx?|jsx?)$/.test(file)) {
      results.push(filePath);
    }
  }
  return results;
}

describe("Frontend Modal Policy Enforcement", () => {
  it("forbids native window.alert, window.confirm, and window.prompt across all web/src source files", () => {
    const srcDir = join(import.meta.dir, "../src");
    const files = getAllSourceFiles(srcDir);

    const violations: { file: string; line: number; match: string }[] = [];

    // Regex checking bare alert(, confirm(, prompt(, window.alert(, window.confirm(, window.prompt(
    const dialogRegex = /(?:(?:\bwindow\.)?(alert|confirm|prompt)\s*\()/g;

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Strip single line comments
        const cleanLine = line.replace(/\/\/.*$/, "");

        let match: RegExpExecArray | null = dialogRegex.exec(cleanLine);
        while (match !== null) {
          const matchedIndex = match.index;
          // Check prefix before match: if it's preceded by modalDialog. or store. or this. then it's permitted
          const prefix = cleanLine.substring(Math.max(0, matchedIndex - 20), matchedIndex);
          const isOurHelper =
            prefix.endsWith("modalDialog.") ||
            prefix.endsWith("store.") ||
            prefix.endsWith("dialogStore.") ||
            prefix.endsWith("state.") ||
            prefix.endsWith("getState().");
          // If inside dialogStore.ts defining alert: / confirm:, allow method definitions
          const isStoreDef =
            file.endsWith("dialogStore.ts") &&
            (cleanLine.includes("alert:") ||
              cleanLine.includes("confirm:") ||
              cleanLine.includes("alert =") ||
              cleanLine.includes("confirm =") ||
              cleanLine.includes("async alert(") ||
              cleanLine.includes("confirm("));

          if (!isOurHelper && !isStoreDef) {
            violations.push({
              file: file.replace(/^.*\/web\/src\//, "src/"),
              line: i + 1,
              match: line.trim(),
            });
          }
          match = dialogRegex.exec(cleanLine);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("triggers alert modal through modalDialog and updates dialogStore state", async () => {
    // Initial state
    expect(useDialogStore.getState().isOpen).toBe(false);

    // Call alert
    const promise = modalDialog.alert("Cảnh báo an toàn 6S", "Tiêu đề cảnh báo");

    expect(useDialogStore.getState().isOpen).toBe(true);
    expect(useDialogStore.getState().options.title).toBe("Tiêu đề cảnh báo");
    expect(useDialogStore.getState().options.message).toBe("Cảnh báo an toàn 6S");
    expect(useDialogStore.getState().options.type).toBe("alert");

    // Close / confirm
    useDialogStore.getState().handleConfirm();
    await promise;

    expect(useDialogStore.getState().isOpen).toBe(false);
  });

  it("handles confirm modal promise resolving to true or false", async () => {
    // Case 1: confirm approved
    const p1 = modalDialog.confirm("Bạn có chắc muốn xóa?", "Xác nhận", true);
    expect(useDialogStore.getState().isOpen).toBe(true);
    expect(useDialogStore.getState().options.destructive).toBe(true);
    useDialogStore.getState().handleConfirm();
    const res1 = await p1;
    expect(res1).toBe(true);
    expect(useDialogStore.getState().isOpen).toBe(false);

    // Case 2: confirm cancelled
    const p2 = modalDialog.confirm("Bạn có chắc muốn xóa?", "Xác nhận");
    expect(useDialogStore.getState().isOpen).toBe(true);
    useDialogStore.getState().handleCancel();
    const res2 = await p2;
    expect(res2).toBe(false);
    expect(useDialogStore.getState().isOpen).toBe(false);
  });

  it("renders GlobalDialog component with accessibility role and backdrop", () => {
    const html = renderToString(
      <GlobalDialog
        isOpen={true}
        options={{
          title: "Xác nhận thao tác",
          message: "Bạn có chắc muốn tiếp tục không?",
          type: "confirm",
          confirmText: "Đồng ý",
          cancelText: "Hủy",
        }}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Xác nhận thao tác");
    expect(html).toContain("Bạn có chắc muốn tiếp tục không?");
    expect(html).toContain("Đồng ý");
    expect(html).toContain("Hủy");

    const emptyHtml = renderToString(<GlobalDialog isOpen={false} />);
    expect(emptyHtml).toBe("");
  });
});
