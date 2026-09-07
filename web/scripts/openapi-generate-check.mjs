#!/usr/bin/env node
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const generated = resolve(root, "src/api/generated");
const temp = mkdtempSync(join(tmpdir(), "6s-openapi-"));
try {
  execFileSync(resolve(root, "node_modules/.bin/openapi-ts"), ["--file", "openapi-ts.config.ts", "--output", temp], {
    cwd: root,
    stdio: "inherit",
  });
  const files = (dir, prefix = "") =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const relative = join(prefix, entry.name);
      return entry.isDirectory() ? files(join(dir, entry.name), relative) : [relative];
    });
  const expected = files(generated).sort();
  const actual = files(temp).sort();
  if (expected.length !== actual.length || expected.some((file, index) => file !== actual[index])) {
    throw new Error("Generated OpenAPI client is stale; run `bun run openapi:generate`");
  }
  for (const file of expected) {
    if (readFileSync(join(generated, file), "utf8") !== readFileSync(join(temp, file), "utf8")) {
      throw new Error(`Generated OpenAPI client is stale: ${file}`);
    }
  }
  console.log("Generated OpenAPI client is up to date");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
