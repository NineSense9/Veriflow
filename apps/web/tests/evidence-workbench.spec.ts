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
  await expect(page.getByLabel("CASE 4 验证流")).toBeVisible();
  await expect(page.getByText("NOTIFY_NOT_OBSERVED")).toBeVisible();
  await expect(page.getByText("BLOCKED", { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByLabel("CASE 4 验证流")).toBeVisible();
  expect(writes).toBe(0);
});
