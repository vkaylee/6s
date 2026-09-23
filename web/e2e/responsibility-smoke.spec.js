import { test, expect } from '@playwright/test';
import { getE2EConfig, loginViaAPI, loginViaUI, MINIMAL_PNG } from './helpers.js';

// End-to-end responsibility regression coverage: location, asset, team, cause, and KPI stay independent.
test('responsibility ownership remains independent from physical location', async ({ request, page }) => {
  const { baseURL, otherLocationCode } = getE2EConfig();
  const admin = await loginViaAPI(request);
  const worker = await loginViaAPI(request, 'e2e-worker', 'E2EWorker123!');
  const headers = { Authorization: `Bearer ${admin.access_token}` };
  const workerHeaders = { Authorization: `Bearer ${worker.access_token}` };
  const stamp = Date.now().toString();
  const teamResponse = await request.post(`${baseURL}/api/admin/teams`, {
    headers, data: { code: `SMOKE_${stamp}`, name: `Electrical ${stamp}`, is_active: true },
  });
  expect(teamResponse.status(), await teamResponse.text()).toBe(201);
  const team = (await teamResponse.json()).data;
  const membersResponse = await request.get(`${baseURL}/api/admin/users`, { headers });
  expect(membersResponse.ok(), await membersResponse.text()).toBe(true);
  const users = (await membersResponse.json()).data;
  const member = users.find((user) => user.username === 'e2e-worker');
  expect(member).toBeDefined();
  const addMember = await request.put(`${baseURL}/api/admin/teams/${team.id}/members/${member.id}`, { headers });
  expect(addMember.ok(), await addMember.text()).toBe(true);
  const assetResponse = await request.post(`${baseURL}/api/admin/assets`, {
    headers, data: { asset_code: `DB_${stamp}`, name: `Panel ${stamp}`, location_code: otherLocationCode, default_team_id: team.id, is_active: true },
  });
  expect(assetResponse.status(), await assetResponse.text()).toBe(201);
  const asset = (await assetResponse.json()).data;
  const created = await request.post(`${baseURL}/api/issues/sync`, {
    headers, multipart: {
      client_uuid: crypto.randomUUID(), category: '1S', location_code: otherLocationCode,
      description: `Responsibility smoke ${stamp}`, asset_id: String(asset.id),
      assigned_team_id: String(team.id), assignee_id: String(member.id),
      photo_before: { name: 'before.png', mimeType: 'image/png', buffer: MINIMAL_PNG },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const issue = (await created.json()).data;
  expect(issue.location_code).toBe(otherLocationCode);
  expect(issue.assigned_team_id).toBe(team.id);
  expect(issue.asset_id).toBe(asset.id);
  expect(issue.cause_status).toBe('UNVERIFIED');
  expect(issue.cause_team_id ?? null).toBeNull();
  const view = await request.get(`${baseURL}/api/issues/${issue.id}`, { headers: workerHeaders });
  expect(view.ok(), await view.text()).toBe(true);
  const visibleIssue = (await view.json()).data;
  expect(visibleIssue.allowed_actions.resolve).toBe(true);
  expect(visibleIssue.allowed_actions.close).toBe(false);
  const forbiddenAssign = await request.patch(`${baseURL}/api/issues/${issue.id}`, {
    headers: workerHeaders, data: { expected_version: issue.version, assigned_team_id: null },
  });
  expect(forbiddenAssign.status()).toBe(403);
  const causePatch = await request.patch(`${baseURL}/api/issues/${issue.id}`, {
    headers, data: { expected_version: issue.version, cause_team_id: team.id, cause_status: 'CONFIRMED' },
  });
  expect(causePatch.ok(), await causePatch.text()).toBe(true);
  const verified = (await causePatch.json()).data;
  const stale = await request.patch(`${baseURL}/api/issues/${issue.id}`, {
    headers, data: { expected_version: issue.version, assigned_team_id: null },
  });
  expect(stale.status()).toBe(409);
  const resolve = await request.post(`${baseURL}/api/issues/${issue.id}/resolve`, {
    headers: workerHeaders, multipart: {
      expected_version: String(verified.version), resolved_client_uuid: crypto.randomUUID(),
      photo_after: { name: 'after.png', mimeType: 'image/png', buffer: MINIMAL_PNG },
    },
  });
  expect(resolve.ok(), await resolve.text()).toBe(true);
  const resolved = (await resolve.json()).data;
  const selfClose = await request.post(`${baseURL}/api/issues/${issue.id}/close`, {
    headers: workerHeaders, data: { expected_version: resolved.version, score_rating: 3 },
  });
  expect(selfClose.status()).toBe(403);
  const close = await request.post(`${baseURL}/api/issues/${issue.id}/close`, {
    headers, data: { expected_version: resolved.version, score_rating: 3 },
  });
  expect(close.ok(), await close.text()).toBe(true);
  const detailResponse = await request.get(`${baseURL}/api/issues/${issue.id}`, { headers });
  const detail = (await detailResponse.json()).data;
  expect(detail.status).toBe('CLOSED');
  expect(detail.cause_team_id).toBe(team.id);
  expect(detail.responsibility_history.some((entry) => JSON.stringify(entry).includes('CONFIRMED'))).toBe(true);
  const reportResponse = await request.get(`${baseURL}/api/reports/teams?days=14`, { headers });
  expect(reportResponse.ok(), await reportResponse.text()).toBe(true);
  const teamReport = (await reportResponse.json()).data.find((row) => row.team_id === team.id);
  expect(Number(teamReport.closed_count)).toBe(1);
  expect(Number(teamReport.confirmed_cause_count)).toBe(1);
  const filtered = await request.get(`${baseURL}/api/issues?assigned_team_id=${team.id}`, { headers });
  const filteredIssues = (await filtered.json()).data;
  expect(filteredIssues.map((row) => row.id)).toContain(issue.id);
  expect(filteredIssues.every((row) => row.assigned_team_id === team.id)).toBe(true);
  await loginViaUI(page);
  await page.goto(`${baseURL}/?issue_id=${issue.id}`);
  const issueModal = page
    .locator("div.fixed.inset-0.z-50")
    .filter({ hasText: `Responsibility smoke ${stamp}` })
    .last();
  await expect(issueModal).toBeVisible();
  await expect(issueModal.getByText(`Electrical ${stamp}`, { exact: false }).first()).toBeVisible();
  await expect(issueModal.getByText(member.full_name, { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: '../artifacts/e2e/responsibility-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '../artifacts/e2e/responsibility-mobile.png', fullPage: true });
  await page.goto(`${baseURL}/admin/teams`);
  await expect(page.getByText(`Electrical ${stamp}`, { exact: false }).last()).toBeVisible();
  await page.screenshot({ path: '../artifacts/e2e/responsibility-teams-mobile.png', fullPage: true });
  await page.goto(`${baseURL}/admin/assets`);
  await expect(page.getByText(`Panel ${stamp}`, { exact: false }).last()).toBeVisible();
  await page.screenshot({ path: '../artifacts/e2e/responsibility-assets-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/reports`);
  await page.getByTestId("reports-tab-teams").click();
  await expect(page.getByText(`Electrical ${stamp}`, { exact: false }).last()).toBeVisible();
  await page.screenshot({ path: '../artifacts/e2e/responsibility-team-report.png', fullPage: true });
});
