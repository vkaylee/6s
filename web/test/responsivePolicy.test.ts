import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

describe("Frontend Responsive & Anti-Clipping Policy Enforcement", () => {
  const srcDir = join(import.meta.dir, "../src");
  const files = getAllSourceFiles(srcDir);

  it("forbids combining 'flex' and 'truncate' directly on the same element className", () => {
    // Having flex and truncate on the same element causes flex children to be clipped abruptly
    // without standard text ellipsis. Truncate must be applied to the inner text element instead.
    const violations: { file: string; line: number; match: string }[] = [];
    const flexTruncateRegex = /className="[^"]*\b(flex|inline-flex)\b[^"]*\btruncate\b[^"]*"/g;

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("//")) continue;

        let match: RegExpExecArray | null = flexTruncateRegex.exec(line);
        while (match !== null) {
          violations.push({
            file: file.replace(/\\/g, "/"),
            line: i + 1,
            match: match[0],
          });
          match = flexTruncateRegex.exec(line);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("requires safe-area-inset-bottom on fixed bottom navigation containers", () => {
    // Fixed bottom containers must respect mobile gesture bars (iOS home indicator)
    const violations: { file: string; line: number; snippet: string }[] = [];
    const fixedBottomRegex = /className="[^"]*\bfixed\s+bottom-0\b[^"]*"/g;

    for (const file of files) {
      // Exclude toast or test mocks if any
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("//")) continue;

        let match: RegExpExecArray | null = fixedBottomRegex.exec(line);
        while (match !== null) {
          if (!line.includes("safe-area-inset-bottom")) {
            violations.push({
              file: file.replace(/\\/g, "/"),
              line: i + 1,
              snippet: match[0],
            });
          }
          match = fixedBottomRegex.exec(line);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("ensures leaderboard tab switcher buttons have whitespace-nowrap", () => {
    const leaderboardFile = join(srcDir, "layout/AppLeaderboardsWidget.tsx");
    const content = readFileSync(leaderboardFile, "utf-8");

    // Both leaderboard tab buttons must specify whitespace-nowrap
    const tabButtons =
      content.match(
        /<button[\s\S]*?onClick=\{\(\)\s*=>\s*\{[\s\S]*?setLeaderboardTab[\s\S]*?<\/button>/g,
      ) || [];
    expect(tabButtons.length).toBeGreaterThan(0);
    for (const btn of tabButtons) {
      expect(btn).toContain("whitespace-nowrap");
    }
  });
});
