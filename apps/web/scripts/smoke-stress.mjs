import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../output/playwright");
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(40000);

await page.goto("http://127.0.0.1:3000/login");
await page.fill("#user", "demo");
await page.fill("#pass", "demo");
await page.click("button[type=submit]");
await page.waitForURL("http://127.0.0.1:3000/");

await page.goto("http://127.0.0.1:3000/stress?id=VF1001");
await page.waitForSelector("text=生成器");
await page.waitForSelector(".monaco-editor", { timeout: 20000 });
await page.getByRole("button", { name: "开拍" }).click();
await page.waitForFunction(() => {
  const el = document.querySelector(".stress-log .verdict");
  return el && el.textContent && el.textContent.trim().length > 0;
});
await page.screenshot({ path: path.join(dir, "stress.png") });
const status = (await page.locator(".stress-log .verdict").innerText()).trim();
await browser.close();
console.log("SMOKE_STRESS", status);
if (status !== "mismatch") {
  throw new Error(`expected mismatch, got ${status}`);
}
