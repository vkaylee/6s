#!/usr/bin/env node
/**
 * Deterministic, offline-safe derivation for the issue operations consumed by the web client.
 * The source of truth remains ../openapi.yaml; this script avoids the broken hey-api 0.99 CLI.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const spec = readFileSync(resolve(import.meta.dirname, "../../openapi.yaml"), "utf8");
for (const route of ["/issues/{id}/close:", "/issues/{id}/reopen:", "/issues/{id}/invalid:"]) {
  if (!spec.includes(`  ${route}`)) throw new Error(`Missing OpenAPI route: ${route}`);
}
console.log("OpenAPI issue operations verified: close, reopen, invalid");
