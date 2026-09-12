import { test, expect } from "@playwright/test";
import path from "node:path";

test("capture existing public release before deployment", async ({ page }) => {
  test.skip(process.env.CAPTURE_BASELINE !== "1", "Only run explicitly before deployment");
  test.setTimeout(120_000);
  const origin = "http://116.62.5.67:8081";
  const output = path.resolve(process.cwd(), "../../output/visual-polish");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${origin}/login`);
    await expect(page.locator("button[type=submit]")).toBeVisible();
    await page.screenshot({ path: path.join(output, `login-${width}-before.png`) });
  }
  await page.locator("#user").fill("demo");
  await page.locator("#pass").fill("demo");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(`${origin}/`);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [name, route] of [["home", "/"], ["compose", "/compose"], ["report", "/report/runs/23"]]) {
      await page.goto(`${origin}${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      if (name === "home") await expect(page.getByText("Latest Verification", { exact: true })).toBeVisible();
      if (name === "report") await expect(page.getByRole("heading", { name: "Requirement", exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(output, `${name}-${width}-light-before.png`) });
    }
  }
});
