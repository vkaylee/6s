// @ts-check
import { request } from "@playwright/test";

const positiveEnvMs = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const E2E_TIMEOUT_MS = positiveEnvMs("E2E_STARTUP_TIMEOUT_MS", 60_000);
const POLL_INTERVAL_MS = positiveEnvMs("E2E_POLL_INTERVAL_MS", 1_000);
const REQUEST_TIMEOUT_MS = positiveEnvMs("E2E_REQUEST_TIMEOUT_MS", 5_000);

/**
 * Waits for the isolated application and its post-migration seed account.
 * Uses Playwright's API request context; no host or browser access required.
 * @param {import("@playwright/test").FullConfig} config
 */
export default async function globalSetup(config) {
  const baseURL =
    process.env.E2E_BASE_URL?.trim() ||
    config.projects[0]?.use.baseURL ||
    config.use.baseURL ||
    "http://server:8080";
  const username = process.env.E2E_USERNAME || "e2e-admin";
  const password = process.env.E2E_PASSWORD || "E2EAdmin123!";
  const deadline = Date.now() + E2E_TIMEOUT_MS;
  let lastFailure = "no readiness response";

  const api = await request.newContext({ baseURL });
  try {
    while (Date.now() < deadline) {
      try {
        const ready = await api.get("/api/ready", {
          timeout: REQUEST_TIMEOUT_MS,
        });
        if (!ready.ok()) {
          lastFailure = `readiness returned HTTP ${ready.status()}`;
        } else {
          // Safe request bootstraps readable CSRF cookie before login mutation.
          const csrfBootstrap = await api.get("/api/auth/setup-status", {
            timeout: REQUEST_TIMEOUT_MS,
          });
          if (!csrfBootstrap.ok()) {
            lastFailure = `CSRF bootstrap returned HTTP ${csrfBootstrap.status()}`;
            continue;
          }
          const csrfCookie = (await api.storageState()).cookies.find(
            (cookie) => cookie.name === "6s_csrf",
          );
          const login = await api.post("/api/auth/login", {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
              "Content-Type": "application/json",
              Origin: new URL(baseURL).origin,
              "X-CSRF-Token": csrfCookie?.value || "",
            },
            data: { username, password },
          });
          if (!login.ok()) {
            lastFailure = `seed account login returned HTTP ${login.status()}`;
          } else {
            const payload = await login.json();
            const user = payload?.data?.user;
            const state = await api.storageState();
            const cookieNames = new Set(state.cookies.map((cookie) => cookie.name));
            if (!user || user.username !== username || !cookieNames.has("6s_access") || !cookieNames.has("6s_refresh") || !cookieNames.has("6s_csrf")) {
              lastFailure = "seed account login returned incomplete user/cookie session";
            } else {
              return;
            }
          }
        }
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }

      const remaining = deadline - Date.now();
      if (remaining > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)),
        );
      }
    }
  } finally {
    await api.dispose();
  }

  throw new Error(
    `E2E application/seed readiness timed out after ${E2E_TIMEOUT_MS / 1000}s at ${baseURL}: ${lastFailure}`,
  );
}
