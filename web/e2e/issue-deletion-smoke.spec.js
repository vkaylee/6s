import { test, expect } from '@playwright/test';
import { getE2EConfig, loginViaAPI, loginViaUI, MINIMAL_PNG } from './helpers.js';

test('admin can soft-delete and restore a scored issue while worker remains denied', async ({ request, page }) => {
  const { baseURL, otherLocationCode, workerUsername, workerPassword } = getE2EConfig();
  const admin = await loginViaAPI(request);
  const worker = await loginViaAPI(request, workerUsername, workerPassword);
  const adminHeaders = { Authorization: `Bearer ${admin.access_token}` };
  const workerHeaders = { Authorization: `Bearer ${worker.access_token}` };
  const description = `Deletion smoke ${Date.now()}`;
  const created = await request.post(`${baseURL}/api/issues/sync`, {
    headers: workerHeaders,
    multipart: {
      client_uuid: crypto.randomUUID(),
      category: '1S',
      location_code: otherLocationCode,
      description,
      photo_before: { name: 'before.png', mimeType: 'image/png', buffer: MINIMAL_PNG },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const issue = (await created.json()).data;
  const resolvedResponse = await request.post(`${baseURL}/api/issues/${issue.id}/resolve`, {
    headers: workerHeaders,
    multipart: {
      expected_version: String(issue.version),
      resolved_client_uuid: crypto.randomUUID(),
      photo_after: { name: 'after.png', mimeType: 'image/png', buffer: MINIMAL_PNG },
    },
  });
  expect(resolvedResponse.ok(), await resolvedResponse.text()).toBe(true);
  const resolved = (await resolvedResponse.json()).data;
  const close = await request.post(`${baseURL}/api/issues/${issue.id}/close`, {
    headers: adminHeaders,
    data: { expected_version: resolved.version, score_rating: 5 },
  });
  expect(close.ok(), await close.text()).toBe(true);
  const closed = (await close.json()).data;

  const ledgerBeforeResponse = await request.get(`${baseURL}/api/issues/${issue.id}/score-logs?deletion=active`, {
    headers: adminHeaders,
  });
  expect(ledgerBeforeResponse.ok(), await ledgerBeforeResponse.text()).toBe(true);
  const ledgerBefore = (await ledgerBeforeResponse.json()).data;
  expect(ledgerBefore.length).toBeGreaterThan(0);
  const reporterBeforeResponse = await request.get(`${baseURL}/api/leaderboard/reporters`, {
    headers: adminHeaders,
  });
  expect(reporterBeforeResponse.ok(), await reporterBeforeResponse.text()).toBe(true);
  const reporterBefore = (await reporterBeforeResponse.json()).data.find((row) => row.user_id === worker.user.id);
  expect(reporterBefore).toBeDefined();
  expect(Number(reporterBefore.valid_count)).toBeGreaterThan(0);
  const reportBeforeResponse = await request.get(`${baseURL}/api/reports/summary?days=14`, {
    headers: adminHeaders,
  });
  expect(reportBeforeResponse.ok(), await reportBeforeResponse.text()).toBe(true);
  const reportBefore = (await reportBeforeResponse.json()).data;
  expect(Number(reportBefore.kpi.totalIssues)).toBeGreaterThan(0);

  const denied = await request.post(`${baseURL}/api/issues/${issue.id}/delete`, {
    headers: workerHeaders,
    data: { reason: 'worker must not delete', expected_version: closed.version },
  });
  expect(denied.status()).toBe(403);

  await loginViaUI(page);
  await page.goto(`${baseURL}/?issue_id=${issue.id}`);
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();

  const deleteLabel = /delete|xoá|xóa|删除/i;
  const restoreLabel = /restore|khôi phục|恢复/i;
  const confirmLabel = /confirm|xác nhận|确定/i;
  const filterLabel = /filter|lọc|筛选/i;
  const deletedLabel = /deleted|đã xoá|đã xóa|已删除/i;
  const activeLabel = /active|đang hoạt động|正常/i;

  await detail.getByRole('button', { name: deleteLabel }).click();
  const reasonInput = detail.locator('textarea').first();
  await expect(reasonInput).toBeVisible();
  await reasonInput.fill('Duplicate report from UI dialog');
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/issues/${issue.id}/delete`) &&
      response.request().method() === 'POST' &&
      response.ok(),
    ),
    detail.getByRole('button', { name: confirmLabel }).click(),
  ]);
  await expect(detail.getByText(/deleted|đã xoá|đã xóa|已删除/i).first()).toBeVisible();

  const hidden = await request.get(`${baseURL}/api/issues/${issue.id}`, { headers: workerHeaders });
  expect(hidden.status()).toBe(404);
  const deletedList = await request.get(`${baseURL}/api/issues?deletion=deleted&limit=100`, {
    headers: adminHeaders,
  });
  expect(deletedList.ok(), await deletedList.text()).toBe(true);
  expect((await deletedList.json()).data.map((row) => row.id)).toContain(issue.id);
  const deletedLedgerResponse = await request.get(`${baseURL}/api/issues/${issue.id}/score-logs?deletion=deleted`, {
    headers: adminHeaders,
  });
  expect(deletedLedgerResponse.ok(), await deletedLedgerResponse.text()).toBe(true);
  const deletedLedger = (await deletedLedgerResponse.json()).data;
  expect(deletedLedger.map((row) => row.id)).toEqual(ledgerBefore.map((row) => row.id));
  expect(deletedLedger.reduce((sum, row) => sum + Number(row.points), 0)).toBe(
    ledgerBefore.reduce((sum, row) => sum + Number(row.points), 0),
  );
  const reporterDeletedResponse = await request.get(`${baseURL}/api/leaderboard/reporters`, {
    headers: adminHeaders,
  });
  expect(reporterDeletedResponse.ok(), await reporterDeletedResponse.text()).toBe(true);
  const reporterDeleted = (await reporterDeletedResponse.json()).data.find((row) => row.user_id === worker.user.id);
  expect(Number(reporterDeleted?.valid_count ?? 0)).toBeLessThan(Number(reporterBefore.valid_count));
  const reportDeletedResponse = await request.get(`${baseURL}/api/reports/summary?days=14`, {
    headers: adminHeaders,
  });
  expect(reportDeletedResponse.ok(), await reportDeletedResponse.text()).toBe(true);
  const reportDeleted = (await reportDeletedResponse.json()).data;
  expect(Number(reportDeleted.kpi.totalIssues)).toBeLessThan(Number(reportBefore.kpi.totalIssues));

  await expect(detail.getByRole('button', { name: restoreLabel })).toBeVisible();
  await expect(detail.getByRole('button', { name: deleteLabel })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: /edit|sửa|编辑/i })).toHaveCount(0);
  await detail.getByRole('button', { name: /close|đóng|关闭/i }).first().click();

  await page.getByRole('button', { name: filterLabel }).click();
  await page.getByRole('button', { name: deletedLabel }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await page.getByText(description, { exact: true }).click();
  const deletedDetail = page.getByRole('dialog');
  await expect(deletedDetail.getByRole('button', { name: restoreLabel })).toBeVisible();
  await expect(deletedDetail.getByRole('button', { name: deleteLabel })).toHaveCount(0);
  await expect(deletedDetail.getByRole('button', { name: /resolve|khắc phục|整改/i })).toHaveCount(0);

  await deletedDetail.getByRole('button', { name: restoreLabel }).click();
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/issues/${issue.id}/restore`) &&
      response.request().method() === 'POST' &&
      response.ok(),
    ),
    deletedDetail.getByRole('button', { name: confirmLabel }).click(),
  ]);
  const restoredLedgerResponse = await request.get(`${baseURL}/api/issues/${issue.id}/score-logs?deletion=active`, {
    headers: adminHeaders,
  });
  expect(restoredLedgerResponse.ok(), await restoredLedgerResponse.text()).toBe(true);
  const restoredLedger = (await restoredLedgerResponse.json()).data;
  expect(restoredLedger.map((row) => row.id)).toEqual(ledgerBefore.map((row) => row.id));
  const reporterRestoredResponse = await request.get(`${baseURL}/api/leaderboard/reporters`, {
    headers: adminHeaders,
  });
  expect(reporterRestoredResponse.ok(), await reporterRestoredResponse.text()).toBe(true);
  const reporterRestored = (await reporterRestoredResponse.json()).data.find((row) => row.user_id === worker.user.id);
  expect(Number(reporterRestored?.valid_count ?? 0)).toBe(Number(reporterBefore.valid_count));
  const reportRestoredResponse = await request.get(`${baseURL}/api/reports/summary?days=14`, {
    headers: adminHeaders,
  });
  expect(reportRestoredResponse.ok(), await reportRestoredResponse.text()).toBe(true);
  const reportRestored = (await reportRestoredResponse.json()).data;
  expect(Number(reportRestored.kpi.totalIssues)).toBe(Number(reportBefore.kpi.totalIssues));
  await expect(deletedDetail.getByRole('button', { name: deleteLabel })).toBeVisible();
  await expect(deletedDetail.getByRole('button', { name: restoreLabel })).toHaveCount(0);
  await deletedDetail.getByRole('button', { name: /close|đóng|关闭/i }).first().click();

  await page.getByRole('button', { name: 'Advanced Filters', exact: true }).click();
  await page.getByRole('button', { name: activeLabel }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText(description, { exact: true })).toBeVisible();

  const active = await request.get(`${baseURL}/api/issues?deletion=active&limit=100`, {
    headers: adminHeaders,
  });
  expect(active.ok(), await active.text()).toBe(true);
  expect((await active.json()).data.map((row) => row.id)).toContain(issue.id);
});
