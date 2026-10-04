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

async function mockVerification(page: Page, waitFor: "tour-start" | "tour-repair" | null = null) {
  await page.addInitScript(() => {
    sessionStorage.setItem("vf_user", "demo");
    sessionStorage.setItem("vf_token", "lifecycle-test");
    localStorage.setItem("vf_prefs", JSON.stringify({ effectsLevel: "off" }));
  });
  let release: (() => void) | undefined;
  let waiting = false;
  let case4Requests = 0;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let json: any = {};
    if (url.pathname === "/api/auth/me") json = { username: "demo", role: "student" };
    else if (url.pathname === "/api/demos") json = { demos: [
      { id: "case1_order", title: "case1_order", kind: "test" },
      { id: "case4_runtime", title: "case4_runtime", kind: "test" },
    ] };
    else if (url.pathname === "/api/report/history") json = { runs: [] };
    else if (url.pathname === "/api/report/session") {
      const id = route.request().postDataJSON().demo;
      if (id === "case4_runtime") case4Requests++;
      if (waitFor === "tour-start" && id === "case1_order") { waiting = true; await pending; }
      json = cases[id];
    } else if (url.pathname.endsWith("/repair")) {
      if (waitFor === "tour-repair") { waiting = true; await pending; }
      json = cases.case1_order;
    } else if (url.pathname.startsWith("/api/report/runs/")) json = cases.case1_order;
    await route.fulfill({ json });
  });
  return { release: () => release?.(), waiting: () => waiting, case4Requests: () => case4Requests };
}

test("stored case 1 keeps its case selector and story tied to the saved workflow", async ({ page }) => {
  await mockVerification(page);
  await page.goto("/report/runs/1");
  await expect(page.locator(".vf-verdict")).toBeVisible();
  await expect(page.locator("select")).toHaveValue("case1_order");
  await expect(page.locator(".vf-storyboard-title")).toHaveText("生成器直接入库");
  await expect(page.locator(".vf-storyboard-container")).not.toContainText("轨迹在支付分支后中断");
});

test("stopping a pending tour load prevents it overwriting the selected case", async ({ page }) => {
  const control = await mockVerification(page, "tour-start");
  await page.goto("/report?demo=case4_runtime");
  await expect(page.locator(".vf-verdict")).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "▶ 巡航演练", exact: true }).click();
  await expect.poll(control.waiting).toBe(true);
  await page.getByRole("button", { name: "■ 停止巡航", exact: true }).click();
  await page.locator("select").selectOption("case4_runtime");
  await page.getByRole("button", { name: "运行案例", exact: true }).click();
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case4_runtime");
  const lateResponse = page.waitForResponse(response => response.url().endsWith("/api/report/session") && response.request().postDataJSON()?.demo === "case1_order");
  control.release();
  await (await lateResponse).finished();
  await page.clock.runFor(100);
  await expect(page.locator("select")).toHaveValue("case4_runtime");
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case4_runtime");
  await page.clock.fastForward(8000);
  await expect(page.locator("select")).toHaveValue("case4_runtime");
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case4_runtime");
  await expect(page.locator(".vf-tour-floating-banner")).toHaveCount(0);
});

test("switching during tour repair prevents the late repair response overwriting the new case", async ({ page }) => {
  const control = await mockVerification(page, "tour-repair");
  await page.goto("/report?demo=case4_runtime");
  await expect(page.locator(".vf-verdict")).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "▶ 巡航演练", exact: true }).click();
  await expect(page.locator("select")).toHaveValue("case1_order");
  await page.clock.fastForward(4000);
  await expect.poll(control.waiting).toBe(true);
  await page.locator("select").selectOption("case4_runtime");
  await page.getByRole("button", { name: "运行案例", exact: true }).click();
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case4_runtime");
  const lateResponse = page.waitForResponse(response => response.url().endsWith("/repair"));
  control.release();
  await (await lateResponse).finished();
  await page.clock.runFor(100);
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case4_runtime");
  await page.clock.fastForward(8000);
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case4_runtime");
  await expect(page.locator(".vf-tour-floating-banner")).toHaveCount(0);
});

test("leaving the workbench cancels the remaining tour steps", async ({ page }) => {
  const control = await mockVerification(page, "tour-repair");
  await page.goto("/report?demo=case4_runtime");
  await expect(page.locator(".vf-verdict")).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "▶ 巡航演练", exact: true }).click();
  await expect(page.locator("select")).toHaveValue("case1_order");
  await page.clock.fastForward(4000);
  await expect.poll(control.waiting).toBe(true);
  await page.getByRole("link", { name: "题库训练", exact: true }).first().click();
  await expect(page).toHaveURL(/\/problems$/);
  const count = control.case4Requests();
  const lateResponse = page.waitForResponse(response => response.url().endsWith("/repair"));
  control.release();
  await (await lateResponse).finished();
  await page.clock.runFor(100);
  await page.clock.fastForward(8000);
  expect(control.case4Requests()).toBe(count);
});

test("manual repair ends the active tour before starting its own request", async ({ page }) => {
  await mockVerification(page);
  await page.goto("/report?demo=case4_runtime");
  await expect(page.locator(".vf-verdict")).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "▶ 巡航演练", exact: true }).click();
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case1_order");
  await page.getByRole("button", { name: "受约束修复", exact: true }).click();
  await expect(page.locator(".vf-verdict .kicker")).toContainText("case1_order");
  await expect(page.locator(".vf-tour-floating-banner")).toHaveCount(0);
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
