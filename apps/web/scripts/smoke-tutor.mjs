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

await page.goto("http://127.0.0.1:3000/problems/VF1001");
await page.waitForSelector(".monaco-editor", { timeout: 20000 });
await page.getByRole("button", { name: "提交" }).click();
await page.waitForFunction(() => {
  const el = document.querySelector(".verdict-bar .verdict");
  return el && el.textContent.trim() === "WA";
});
await page.getByRole("button", { name: "教练" }).click();
await page.waitForFunction(() => {
  const aside = document.querySelector("aside.side");
  return Boolean(aside && (aside.innerText.includes("？") || aside.innerText.includes("?")));
});
await page.screenshot({ path: path.join(dir, "tutor.png") });
await browser.close();
console.log("SMOKE_TUTOR_OK");
