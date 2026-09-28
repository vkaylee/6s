#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const WEB_ROOT = resolve(import.meta.dirname, "..");
const BASELINE_PATH = resolve(WEB_ROOT, ".max-lines-baseline.json");

let maxLinesLimit = 500;
let baselineMap = {};

if (existsSync(BASELINE_PATH)) {
  try {
    const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    if (raw.max_lines_limit) maxLinesLimit = raw.max_lines_limit;
    if (raw.baseline) baselineMap = raw.baseline;
  } catch (err) {
    console.error(`Warning: Failed to parse ${BASELINE_PATH}:`, err.message);
  }
}

function scanFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry !== "node_modules" && entry !== "generated") results.push(...scanFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

const filesToCheck = scanFiles(resolve(WEB_ROOT, "src")).concat(
  scanFiles(resolve(WEB_ROOT, "test")),
);

// Exclude generated files.
const sourceFiles = filesToCheck.filter((fullPath) => {
  const rel = relative(WEB_ROOT, fullPath).replace(/\\/g, "/");
  return !rel.includes("src/api/generated/");
});

let failed = false;
for (const fullPath of sourceFiles) {
  const rel = relative(WEB_ROOT, fullPath).replace(/\\/g, "/");
  const content = readFileSync(fullPath, "utf8");
  const lineCount = content === "" ? 0 : content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0);
  const baselineLimit = baselineMap[rel];

  if (baselineLimit !== undefined && lineCount > baselineLimit) {
    console.error(
      `❌ [max-lines] ${rel} grew to ${lineCount} lines (baseline limit: ${baselineLimit}, goal: ${maxLinesLimit})`,
    );
    failed = true;
  } else if (baselineLimit === undefined && lineCount > maxLinesLimit) {
    console.error(`❌ [max-lines] ${rel} has ${lineCount} lines (exceeds limit: ${maxLinesLimit})`);
    failed = true;
  }
}

if (failed) process.exit(1);

console.log(
  `✅ [max-lines] Checked ${sourceFiles.length} file(s) — all comply with the ${maxLinesLimit}-line limit or baseline ratchets.`,
);

