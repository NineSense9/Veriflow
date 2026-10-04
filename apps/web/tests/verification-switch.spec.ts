import { test, expect } from "@playwright/test";
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

test("switching cases clears the previous evidence before the new run completes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    sessionStorage.setItem("vf_user", "demo");
    sessionStorage.setItem("vf_token", "switch-test");
    localStorage.setItem("vf_prefs", JSON.stringify({ effectsLevel: "off" }));
  });

  let releaseCase4: (() => void) | undefined;
  const case4Ready = new Promise<void>((resolve) => { releaseCase4 = resolve; });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let json: any = {};
    if (url.pathname === "/api/auth/me") json = { username: "demo", role: "student" };
    else if (url.pathname === "/api/health") json = { ok: true, sandbox: "process" };
    else if (url.pathname === "/api/report/history") json = { runs: [] };
    else if (url.pathname === "/api/demos") json = { demos: [
      { id: "case1_order", title: "case1_order", kind: "test" },
      { id: "case4_runtime", title: "case4_runtime", kind: "test" },
    ] };
    else if (url.pathname === "/api/report/session") {
      const body = route.request().postDataJSON() as { demo?: string };
      if (body.demo === "case4_runtime") {
        await case4Ready;
        json = cases.case4_runtime;
      } else {
        json = cases.case1_order;
      }
    } else if (url.pathname.startsWith("/api/report/runs/")) json = cases.case1_order;
    await route.fulfill({ json });
  });

  await page.goto("/report?demo=case1_order");
  await expect(page.locator('.vf-verdict [data-status="BLOCKED"]')).toBeVisible();

  await page.locator("select").selectOption("case4_runtime");
  await page.getByRole("button", { name: "运行案例", exact: true }).click();
  await expect(page.locator('[data-verification-state="loading"]')).toBeVisible();
  await expect(page.locator(".vf-verdict")).toHaveCount(0);
  await expect(page.getByText("正在验证案例", { exact: false })).toBeVisible();

  releaseCase4?.();
  await expect(page.locator('.vf-verdict [data-status="BLOCKED"]')).toBeVisible();
  await expect(page.getByText("补丁已通过复验", { exact: true })).toHaveCount(0);
  await expect(page.locator(".vf-storyboard-container").getByText("轨迹在支付分支后中断", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".vf-storyboard-container").getByText("通知、审题门和入库未执行。", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("静态 0 · 运行 5", { exact: false })).toBeVisible();
  await expect(page.locator(".vf-dag")).toHaveCSS("min-height", "360px");
  await expect(page.locator(".vf-issue-option").first()).toBeVisible();
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("opening report without a demo never loads the latest submission", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    sessionStorage.setItem("vf_user", "demo");
    sessionStorage.setItem("vf_token", "switch-test");
    localStorage.setItem("vf_prefs", JSON.stringify({ effectsLevel: "off" }));
  });

  const sessionRequests: string[] = [];
  let historyRequests = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let json: any = {};
    if (url.pathname === "/api/auth/me") json = { username: "demo", role: "student" };
    else if (url.pathname === "/api/health") json = { ok: true, sandbox: "process" };
    else if (url.pathname === "/api/report/history") { historyRequests++; json = { runs: [{ id: 9001, status: "FAIL" }] }; }
    else if (url.pathname === "/api/demos") json = { demos: [{ id: "case1_order", title: "case1_order", kind: "test" }] };
    else if (url.pathname === "/api/report/session") {
      sessionRequests.push((route.request().postDataJSON() as { demo?: string }).demo || "");
      json = cases.case1_order;
    } else if (url.pathname.startsWith("/api/report/runs/")) json = cases.case1_order;
    await route.fulfill({ json });
  });

  await page.goto("/report");
  await expect(page.locator(".vf-verdict")).toBeVisible();
  expect(sessionRequests.length).toBeGreaterThanOrEqual(1);
  expect(sessionRequests.every((demo) => demo === "case1_order")).toBe(true);
  expect(historyRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("VF1001 recording entry shows the stable WA counterexample at /status/23", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    sessionStorage.setItem("vf_user", "demo");
    sessionStorage.setItem("vf_token", "status-test");
  });
  await page.route("**/api/submissions/23", route => route.fulfill({ json: {
    id: 23, problem_id: "VF1001", lang: "python3", verdict: "WA", time_ms: 4,
    created_at: "2026-10-04T09:00:00", source: "print(666)",
    counterexample: { stdin: "3\\n1 2 3\\n", expected: "6\\n", actual: "666\\n" },
  } }));
  await page.route("**/api/auth/me", route => route.fulfill({ json: { username: "demo", role: "student" } }));
  await page.goto("/status/23");
  await expect(page.getByRole("heading", { name: "VF1001" })).toBeVisible();
  await expect(page.getByText("WA", { exact: true })).toBeVisible();
  await expect(page.getByText("输入测试数据 (stdin)")).toBeVisible();
  await expect(page.getByText("期望标准输出 (expected)")).toBeVisible();
  await expect(page.getByText("实际程序输出 (actual)")).toBeVisible();
  await expect(page.locator(".vf-status-ce-grid > div")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
