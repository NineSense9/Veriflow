import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(process.cwd(), "../..");
const output = path.join(root, "output/graph-layout");
let cases: Record<string, any>;
test.beforeAll(() => {
  execFileSync(process.env.PYTHON || "python", ["scripts/graph_layout_fixtures.py"], { cwd: root, timeout: 60000 });
  cases = JSON.parse(fs.readFileSync(path.join(output, "fixtures.json"), "utf8"));
});

async function openCase(page: Page, name: string, theme = "light") {
  await page.addInitScript(({ theme }) => {
    sessionStorage.setItem("vf_user", "demo"); sessionStorage.setItem("vf_token", "layout-test");
    localStorage.setItem("vf_theme", theme); localStorage.setItem("vf_prefs", JSON.stringify({ effectsLevel: "off" }));
  }, { theme });
  const session = cases[name];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let json: any = {};
    if (url.pathname === "/api/auth/me") json = { username: "demo", role: "student" };
    else if (url.pathname === "/api/health") json = { ok: true, sandbox: "process" };
    else if (url.pathname === "/api/report/history") json = { runs: [{ id: session.run_id, workflow_name: name, status: session.status }] };
    else if (url.pathname.startsWith("/api/report/runs/")) json = session;
    else if (url.pathname === "/api/report/session") json = session;
    else if (url.pathname === "/api/demos") json = { demos: Object.keys(cases).map(id => ({ id, title: id, kind: "test" })) };
    await route.fulfill({ json });
  });
  await page.goto("/");
  await expect(page.locator(".graph-surface .react-flow__node")).toHaveCount(session.ir.nodes.length);
  await expect.poll(async () => page.locator(".react-flow__viewport").first().getAttribute("style")).toContain("translate");
}

async function bounds(page: Page, index = 0) {
  return page.locator(".graph-surface").nth(index).evaluate(el => {
    const rect = el.getBoundingClientRect();
    const nodes = Array.from(el.querySelectorAll(".react-flow__node")).map(node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; });
    const overlap = nodes.some((a,i) => nodes.slice(i+1).some(b => a.x < b.x+b.w-1 && b.x < a.x+a.w-1 && a.y < b.y+b.h-1 && b.y < a.y+a.h-1));
    return { overlap, contained: nodes.every(n => n.x>=rect.x-1 && n.x+n.w<=rect.right+1 && n.y>=rect.y-1 && n.y+n.h<=rect.bottom+1), height: rect.height };
  });
}

for (const name of ["case1_order", "case2_dataflow", "case3_safety", "case4_runtime"]) {
  test(`${name}: selection preserves the complete rail and evidence fits`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCase(page, name);
    await expect.poll(async () => (await bounds(page, 0)).contained).toBe(true);
    expect((await bounds(page, 0)).overlap).toBe(false);
    expect((await bounds(page)).height).toBeLessThanOrEqual(300);
    const viewport = page.locator(".graph-surface .react-flow__viewport");
    const original = await viewport.getAttribute("style");
    for (const node of cases[name].ir.nodes) {
      await page.locator(`.graph-surface .react-flow__node[data-id="${node.id}"]`).click();
      expect(await viewport.getAttribute("style")).toBe(original);
      expect((await bounds(page, 0)).overlap).toBe(false);
    }
    await page.locator(".vf-issue-option").first().click();
    await page.getByRole("button", { name: "证据图", exact: true }).click();
    const graph = page.getByRole("region", { name: "当前问题局部证据链" });
    await expect(graph).toBeVisible();
    await expect.poll(async () => (await bounds(page)).contained).toBe(true);
    expect((await bounds(page)).overlap).toBe(false);
    const ids = await graph.locator(".react-flow__node").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-id")));
    expect(ids.filter(id => id?.startsWith("issue:"))).toHaveLength(1);
    expect(ids.length).toBeLessThan(cases[name].graph.entities.length);
    const evidenceNode = graph.locator(".react-flow__node").first();
    await evidenceNode.click();
    await expect(page.getByRole("region", { name: "证据实体详情" }).or(page.getByRole("region", { name: "当前问题证据" }))).toBeVisible();
    await evidenceNode.focus();
    await evidenceNode.press("Enter");
    await page.getByRole("button", { name: "适应画布", exact: true }).click();
    await page.screenshot({ path: path.join(output, `${name}-evidence.png`), fullPage: true });
  });
}

for (const width of [1440, 1280, 768, 390]) for (const theme of ["light", "dark"]) {
  test(`responsive ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : width === 1280 ? 720 : 900 });
    await openCase(page, "case4_runtime", theme);
    await expect.poll(async () => (await bounds(page, 0)).overlap).toBe(false);
    if (width >= 768) await expect.poll(async () => (await bounds(page, 0)).contained).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".vf-viz").screenshot({ path: path.join(output, `workflow-${width}-${theme}.png`) });
    await page.getByRole("button", { name: "证据图", exact: true }).click();
    await expect(page.getByRole("region", { name: "当前问题局部证据链" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".vf-viz").screenshot({ path: path.join(output, `evidence-${width}-${theme}.png`) });
  });
}
