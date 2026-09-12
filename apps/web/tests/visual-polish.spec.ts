import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const output = path.resolve(process.cwd(), "../../output/visual-polish");
const sizes = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名", { exact: true }).fill("demo");
  await page.getByLabel("密码", { exact: true }).fill("demo");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("login action fits desktop and mobile first viewports", async ({ page }) => {
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto("/login");
    const button = page.locator("button[type=submit]");
    await expect(button).toBeVisible();
    await page.screenshot({ path: path.join(output, `login-${size.width}-after.png`) });
    const box = await button.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("invalid login gives a readable error and valid login works", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("密码", { exact: true }).fill("incorrect-test-password");
  await page.locator("button[type=submit]").click();
  await expect(page.getByRole("alert").filter({ hasText: "用户名或密码不正确" })).toBeVisible();
  await login(page);
});

test("key pages fit all viewports and both themes", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page);
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(theme => localStorage.setItem("vf_theme", theme), theme);
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const route of ["/", "/compose", "/report"]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (route === "/report") await expect(page.locator("main")).toBeVisible();
        await page.screenshot({ path: path.join(output, `${route === "/" ? "home" : route.slice(1)}-${size.width}-${theme}-after.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route}, ${theme}, ${size.width}`).toBe(true);
      }
    }
  }
  expect(errors).toEqual([]);
});
