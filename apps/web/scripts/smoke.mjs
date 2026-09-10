import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../output/playwright");
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(25000);

await page.goto("http://127.0.0.1:3000/login");
await page.fill("#user", "demo");
await page.fill("#pass", "demo");
await page.click("button[type=submit]");
await page.waitForURL("http://127.0.0.1:3000/");
await page.screenshot({ path: path.join(dir, "home.png"), fullPage: true });

await page.goto("http://127.0.0.1:3000/problems");
await page.waitForSelector("table.table");
await page.screenshot({ path: path.join(dir, "problems.png"), fullPage: true });

await page.goto("http://127.0.0.1:3000/problems/VF1001");
page.on("console", (msg) => console.log("BROWSER", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
await page.waitForSelector(".statement");
await page.waitForSelector(".monaco-editor", { timeout: 20000 });
await page.getByRole("button", { name: "提交" }).click();
await page.waitForFunction(() => {
  const el = document.querySelector(".verdict-bar .verdict");
  return el && ["WA", "AC", "CE", "TLE", "RE"].includes(el.textContent.trim());
});
await page.screenshot({ path: path.join(dir, "arena.png") });

const verdict = (await page.locator(".verdict-bar .verdict").innerText()).trim();
await browser.close();
console.log("SMOKE_OK", verdict);
