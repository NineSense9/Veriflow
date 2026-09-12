import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("#user").fill("demo");
  await page.locator("#pass").fill("demo");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

test("home displays recorded graph and evidence without creating a run", async ({ page }) => {
  let writes = 0;
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/api/report/session")) writes++;
  });
  await signIn(page);
  await expect(page.getByRole("group", { name: "选择核验问题" })).toBeVisible();
  await expect(page.locator(".vf-dag .react-flow")).toBeVisible();
  await expect(page.getByRole("region", { name: "当前问题证据" })).toBeVisible();
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByRole("group", { name: "选择核验问题" })).toBeVisible();
  expect(writes).toBe(0);
});
