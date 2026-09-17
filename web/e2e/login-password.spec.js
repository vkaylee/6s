// @ts-check
import { expect, test } from "@playwright/test";
import { getE2EConfig, loginViaUI } from "./helpers.js";

test("login form preserves password whitespace while trimming username", async ({ page }) => {
  const { baseURL } = getE2EConfig();
  let requestBody;
  await page.route("**/api/auth/login", async (route) => {
    requestBody = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          user: {
            id: 1,
            username: "worker01",
            full_name: "Worker 01",
            role: "USER",
          },
        },
      }),
    });
  });

  await page.goto(`${baseURL}/login`);
  await page.locator("#login-username").fill("  worker01  ");
  const password = " password with spaces ";
  await page.locator("#login-password").fill(password);
  await page.locator('button[type="submit"]').click();

  await expect.poll(() => requestBody).toEqual({
    username: "worker01",
    password,
  });
});


test("admin AD save preserves filter, mappings, TLS skip, and blank password", async ({
  page,
}, testInfo) => {
  const { baseURL, username, password } = getE2EConfig();
  await page.route("**/api/config/ad", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            is_enabled: true,
            server: "ad.factory.lan",
            port: 636,
            use_tls: true,
            skip_tls_verify: true,
            base_dn: "DC=factory,DC=lan",
            bind_dn: "CN=svc,DC=factory,DC=lan",
            has_bind_password: true,
            user_filter: "(&(objectClass=user)(uid=%s))",
            group_admin_dn: "CN=Admins,DC=factory,DC=lan",
            group_safety_dn: "CN=Safety,DC=factory,DC=lan",
            group_leader_dn: "CN=Leaders,DC=factory,DC=lan",
          },
        }),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() || "{}");
    expect(body.server).toBe("ad.updated.lan");
    expect(body.skip_tls_verify).toBe(true);
    expect(body.user_filter).toBe("(&(objectClass=user)(uid=%s))");
    expect(body.group_admin_dn).toBe("CN=Admins,DC=factory,DC=lan");
    expect(body.group_safety_dn).toBe("CN=Safety,DC=factory,DC=lan");
    expect(body.group_leader_dn).toBe("CN=Leaders,DC=factory,DC=lan");
    expect(body).not.toHaveProperty("bind_password");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          is_enabled: true,
          server: "ad.updated.lan",
          port: 636,
          use_tls: true,
          skip_tls_verify: true,
          base_dn: "DC=factory,DC=lan",
          bind_dn: "CN=svc,DC=factory,DC=lan",
          has_bind_password: true,
          user_filter: "(&(objectClass=user)(uid=%s))",
          group_admin_dn: "CN=Admins,DC=factory,DC=lan",
          group_safety_dn: "CN=Safety,DC=factory,DC=lan",
          group_leader_dn: "CN=Leaders,DC=factory,DC=lan",
        },
      }),
    });
  });
  await page.route("**/api/config/scoring", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/config/notifications", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/config/ai", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/admin/settings/timezone", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ timezone: "UTC" }),
    });
  });

  await loginViaUI(page, username, password);
  await page.goto(`${baseURL}/admin`);
  await page.getByRole("button", { name: "Active Directory" }).click();
  await page.locator('input[type="text"]').first().fill("ad.updated.lan");
  const saveResponse = page.waitForResponse(
    (response) => response.url().includes("/api/config/ad") && response.request().method() === "PUT" && response.status() === 200,
  );
  await page.getByRole("button", { name: /SAVE SETTINGS|LƯU CẤU HÌNH|保存配置/i }).click();
  await saveResponse;
  await page.getByRole("dialog").getByRole("button").last().click();
  const adSection = page.locator("section").first();
  const adTextInputs = adSection.locator('input[type="text"]');
  await expect(adTextInputs.first()).toHaveValue("ad.updated.lan");
  await expect(adTextInputs.nth(1)).toHaveValue("(&(objectClass=user)(uid=%s))");
  await expect(adTextInputs.nth(2)).toHaveValue("CN=Admins,DC=factory,DC=lan");
  await expect(adSection.locator('input[type="checkbox"]').nth(1)).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("admin-ad-save.png"), fullPage: true });
});

test.describe("login failure banner surfaces the server classified message", () => {
  const scenarios = [
    {
      name: "credential rejection stays a login error",
      status: 401,
      code: "UNAUTHORIZED",
      respond: "Invalid username or password",
      expectBanner: "Invalid username or password",
      rejectBanner: "System error",
    },
    {
      name: "operational outage is not reported as bad credentials",
      status: 500,
      code: "INTERNAL",
      respond: "System error",
      expectBanner: "System error",
      rejectBanner: "Invalid username or password",
    },
  ];
  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      const { baseURL } = getE2EConfig();
      await page.route("**/api/auth/login", async (route) => {
        await route.fulfill({
          status: scenario.status,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: scenario.code, message: scenario.respond } }),
        });
      });

      await page.goto(`${baseURL}/login`);
      await page.locator("#login-username").fill("ad-user");
      await page.locator("#login-password").fill("secret");
      await page.locator('button[type="submit"]').click();

      const banner = page.locator("form > div").first();
      await expect(banner).toHaveText(scenario.expectBanner);
      await expect(banner).not.toHaveText(scenario.rejectBanner);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});