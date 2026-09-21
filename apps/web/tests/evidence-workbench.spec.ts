import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("#user").fill("demo");
  await page.locator("#pass").fill("demo");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

test("home MiniFlow uses CASE 4 demo without creating a report run", async ({ page }) => {
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/report/session")) writes++;
  });
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("当裁判");
  await expect(page.getByLabel("案例 4 验证流程")).toBeVisible();
  await expect(page.getByText("NOTIFY_NOT_OBSERVED")).toBeVisible();
  await expect(page.getByText("已拦截 · BLOCKED", { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByLabel("案例 4 验证流程")).toBeVisible();
  expect(writes).toBe(0);
});

test("repaired PASS remains the latest report after reopening and reload", async ({ page }) => {
  await signIn(page);
  const original = await (await page.request.post('/api/report/session', { data: { demo: 'case1_order' } })).json();
  const response = await page.request.post(`/api/report/runs/${original.run_id}/repair`, { data: { allow_ai: false } });
  expect(response.ok()).toBe(true);
  const passed = await response.json();
  expect(passed.gate.ready).toBe('READY');
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/report/session')) writes++; });
  await page.goto('/report');
  await expect(page.locator('.vf-verdict [data-status="READY"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.vf-verdict [data-status="READY"]')).toBeVisible();
  await expect(page.locator('.vf-verdict .kicker')).toContainText(String(passed.run_id).padStart(4, '0'));
  await page.getByText('受约束修复记录', { exact: false }).click();
  await expect(page.getByRole('heading', { name: '修复后', exact: true })).toBeVisible();
  expect(writes).toBe(0);
});
