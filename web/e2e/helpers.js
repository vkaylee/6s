// @ts-check
import { Buffer } from "node:buffer";

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
    locationCode: process.env.E2E_LOCATION_CODE || "E2E_LINE",
    otherLocationCode: process.env.E2E_OTHER_LOCATION_CODE || "E2E_OTHER_LINE",
  };
}
/**
 * Performs actual UI login via React surface.
 * The isolated E2E database must be bootstrapped with a local account; the
 * production setup endpoint intentionally requires an authenticated context.
 */
export async function loginViaUI(page, customUser, customPass) {
  const { baseURL, username, password } = getE2EConfig();
  const u = customUser || username;
  const p = customPass || password;

  await page.goto(`${baseURL}/login`);

  const setupUsername = page.locator("#setup-username");
  if (await setupUsername.isVisible({ timeout: 1200 }).catch(() => false)) {
    throw new Error(
      "E2E database needs bootstrap account; SetupSuperadminModal requires an authenticated context",
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
 * Performs API login to obtain access and refresh tokens.
 */
export async function loginViaAPI(request, customUser, customPass) {
  const { baseURL, username, password } = getE2EConfig();
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      username: customUser || username,
      password: customPass || password,
    },
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok()) {
    throw new Error(
      `API login failed with status ${res.status()}: ${await res.text()}`,
    );
  }

  const json = await res.json();
  return json.data;
}

/**
 * Ensures two distinct locations exist for isolated filter assertions.
 * Never falls back to unverified locations; requires bootstrap/seed to supply them.
 */
export async function ensureLocationsViaAPI(request, token) {
  const { baseURL, locationCode, otherLocationCode } = getE2EConfig();
  const headers = { Authorization: `Bearer ${token}` };

  const locRes = await request.get(`${baseURL}/api/locations`, { headers });
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
export async function createDeterministicIssue(request, token, options) {
  const { baseURL } = getE2EConfig();
  const headers = { Authorization: `Bearer ${token}` };

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
