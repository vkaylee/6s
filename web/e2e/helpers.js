// @ts-check
import { Buffer } from "node:buffer";
import { request as playwrightRequest } from "@playwright/test";

// Valid 1x1 PNG byte sequence.
export const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/** Returns the required isolated E2E environment configuration. */
export function getE2EConfig() {
  return {
    baseURL:
      process.env.E2E_BASE_URL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      "http://server:8080",
    username: process.env.E2E_USERNAME || "e2e-admin",
    password: process.env.E2E_PASSWORD || "E2EAdmin123!",
    workerUsername: process.env.E2E_WORKER_USERNAME || "e2e-worker",
    workerPassword: process.env.E2E_WORKER_PASSWORD || "E2EWorker123!",
    locationCode: process.env.E2E_LOCATION_CODE || "E2E_LINE",
    otherLocationCode: process.env.E2E_OTHER_LOCATION_CODE || "E2E_OTHER_LINE",
  };
}
/**
 * Performs actual UI login via React surface.
 * The isolated E2E database must be seeded with the configured login account.
 */
export async function loginViaUI(page, customUser, customPass) {
  const { baseURL, username, password } = getE2EConfig();
  const u = customUser || username;
  const p = customPass || password;

  await page.goto(`${baseURL}/login`);

  const setupUsername = page.locator("#setup-username");
  if (await setupUsername.isVisible({ timeout: 1200 }).catch(() => false)) {
    throw new Error(
      "E2E database needs the configured bootstrap account before login tests",
    );
  }

  // LoginPage remembers the last account in localStorage. Switch explicitly
  // so each test uses the account requested by E2E_USERNAME.
  const switchAccountBtn = page.locator(
    'button:has-text("switch_account"), button:has-text("Đăng nhập bằng tài khoản khác"), button:has-text("Sign in with another account"), button:has-text("使用其他账号登录")',
  );
  if (await switchAccountBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await switchAccountBtn.click();
  }

  const usernameInput = page.locator("#login-username");
  if (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await usernameInput.fill(u);
  }
  await page.locator("#login-password").fill(p);
  await page.locator('button[type="submit"]').click();

  // Wait until redirected away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15000,
  });
}

/**
 * Creates an isolated Playwright API context with its own cookie jar.
 */
export async function createAPIContext() {
  const { baseURL } = getE2EConfig();
  return playwrightRequest.newContext({ baseURL });
}

/**
 * Performs API login and stores the auth cookies in the request context jar.
 */
export async function loginViaAPI(request, customUser, customPass) {
  const { baseURL, username, password } = getE2EConfig();
  const bootstrap = await request.get(`${baseURL}/api/auth/setup-status`);
  if (!bootstrap.ok()) {
    throw new Error(`API CSRF bootstrap failed with status ${bootstrap.status()}`);
  }
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      username: customUser || username,
      password: customPass || password,
    },
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(baseURL).origin,
      ...(await csrfHeaders(request)),
    },
  });

  if (!res.ok()) {
    throw new Error(
      `API login failed with status ${res.status()}: ${await res.text()}`,
    );
  }

  const json = await res.json();
  const user = json?.data?.user;
  const state = await request.storageState();
  const cookieNames = new Set(state.cookies.map((cookie) => cookie.name));
  if (!user || !cookieNames.has("6s_access") || !cookieNames.has("6s_refresh") || !cookieNames.has("6s_csrf")) {
    throw new Error("API login returned an incomplete user/cookie session");
  }
  return user;
}

/** Returns the double-submit CSRF header for unsafe API requests. */
export async function csrfHeaders(request) {
  const { baseURL } = getE2EConfig();
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === "6s_csrf")?.value;
  if (!csrf) {
    throw new Error("API session is missing the 6s_csrf cookie");
  }
  return { Origin: new URL(baseURL).origin, "X-CSRF-Token": csrf };
}

/** Injects cookie-auth session state into a browser context for mocked login responses. */
export async function injectAuthCookies(page, baseURL) {
  await page.context().addCookies([
    { name: "6s_access", value: "mock-access-cookie", url: baseURL, httpOnly: true },
    { name: "6s_refresh", value: "mock-refresh-cookie", url: baseURL, httpOnly: true },
    { name: "6s_csrf", value: "mock-csrf-cookie", url: baseURL },
  ]);
}

/**
 * Ensures two distinct locations exist for isolated filter assertions.
 * Never falls back to unverified locations; requires bootstrap/seed to supply them.
 */
export async function ensureLocationsViaAPI(request) {
  const { baseURL, locationCode, otherLocationCode } = getE2EConfig();
  const locRes = await request.get(`${baseURL}/api/locations`);
  if (!locRes.ok()) {
    throw new Error(
      `Failed to list locations via API: ${locRes.status()} ${await locRes.text()}`,
    );
  }

  const locData = await locRes.json();
  const locations = locData.data || [];
  if (locations.length === 0) {
    throw new Error(
      "E2E database has no locations; database bootstrap must seed locations",
    );
  }
  const targetLoc = locationCode || locations[0].code;
  const otherLoc = otherLocationCode;
  const codes = new Set(locations.map((loc) => loc.code));
  if (!codes.has(targetLoc) || !codes.has(otherLoc)) {
    throw new Error(
      `Required E2E locations ${targetLoc} / ${otherLoc} missing from database`,
    );
  }

  return { targetLoc, otherLoc };
}

/**
 * Creates a deterministic issue via POST /api/issues/sync without swallowing errors.
 */
export async function createDeterministicIssue(request, options) {
  const { baseURL } = getE2EConfig();
  const headers = await csrfHeaders(request);

  if (!options?.locationCode) {
    throw new Error("createDeterministicIssue requires locationCode");
  }

  const clientUUID = `00000000-0000-4000-8000-${Date.now()
    .toString(16)
    .padStart(12, "0")}`;
  const syncRes = await request.post(`${baseURL}/api/issues/sync`, {
    headers,
    multipart: {
      client_uuid: clientUUID,
      category: options.category || "1S",
      location_code: options.locationCode,
      description: options.description || `Deterministic E2E Issue ${Date.now()}`,
      photo_before: {
        name: "before.png",
        mimeType: "image/png",
        buffer: MINIMAL_PNG,
      },
    },
  });

  if (!syncRes.ok()) {
    throw new Error(
      `Failed to seed deterministic issue via API: ${syncRes.status()} ${await syncRes.text()}`,
    );
  }

  const syncData = await syncRes.json();
  return syncData.data;
}

