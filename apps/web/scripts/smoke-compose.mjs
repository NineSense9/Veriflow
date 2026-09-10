import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../output/playwright");
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30000);

await page.goto("http://127.0.0.1:3000/login");
await page.fill("#user", "demo");
await page.fill("#pass", "demo");
await page.click("button[type=submit]");
await page.waitForURL("http://127.0.0.1:3000/");

await page.goto("http://127.0.0.1:3000/compose");
await page.getByRole("button", { name: "缺审题门" }).click();
await page.waitForURL(/\/compose\/\d+/);
await page.waitForSelector(".rf-node");
await page.waitForSelector("text=MISSING_HUMAN_GATE");
await page.screenshot({ path: path.join(dir, "compose-blocked.png") });

await page.goto("http://127.0.0.1:3000/compose");
await page.getByRole("button", { name: "完整出题图" }).click();
await page.waitForURL(/\/compose\/\d+/);
await page.waitForSelector(".rf-node.kind-human_gate");
await page.getByRole("button", { name: "审题通过" }).click();
await page.getByRole("button", { name: "入库" }).click();
await page.waitForFunction(() => document.body.innerText.includes("已入库 VF"));
await page.screenshot({ path: path.join(dir, "compose-published.png") });

await browser.close();
console.log("SMOKE_COMPOSE_OK");
