import { test, expect } from "@playwright/test";
import path from "node:path";

const output = path.resolve(process.cwd(), "../../output/readability");
const algorithms = [
  { algorithm_id: "graph.integrity", name: "Graph integrity", category: "Graph", kind: "deterministic", deterministic: true, complexity: "O(V+E) plus guard parse" },
  { algorithm_id: "safety.policy", name: "Safety policy heuristics", category: "Safety", kind: "deterministic", deterministic: true, complexity: "O(V · |config|)" },
  { algorithm_id: "nl.ir_compile", name: "Natural language proposal", category: "AI", kind: "ai_assisted", deterministic: false, complexity: "LLM + parse" },
];
for (const width of [1440, 1280, 768, 390]) for (const theme of ["light", "dark"]) {
  test(`readability ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => { sessionStorage.setItem("vf_user", "demo"); sessionStorage.setItem("vf_token", "test"); localStorage.setItem("vf_theme", theme); }, theme);
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const json = url.pathname === "/api/algorithms" ? { algorithms, count:3, deterministic:2, ai_assisted:1 } : url.pathname === "/api/auth/me" ? { username:"demo" } : { ok:true, sandbox:"mock" };
      await route.fulfill({ json });
    });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/algorithms");
    await expect(page.locator(".chroma-card")).toHaveCount(3);
    await expect(page.locator(".chroma-overlay, .chroma-fade")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Graph integrity" })).toHaveAttribute("href", "/algorithms/graph.integrity");
    const contrast = await page.locator(".chroma-card").evaluateAll(cards => cards.map(card => {
      const parse = (value:string) => (value.match(/[\d.]+/g) || []).slice(0,3).map(Number).map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
      const lum = (value:string) => { const rgb=parse(value); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; };
      const bg=lum(getComputedStyle(card).backgroundColor);
      return Array.from(card.querySelectorAll("h2,.role,.handle,.location")).map(el => { const fg=lum(getComputedStyle(el).color);return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05); });
    }));
    expect(contrast.flat().every(ratio => ratio >= 4.5)).toBe(true);
    await page.screenshot({ path:path.join(output, `algorithms-${width}-${theme}.png`), fullPage:true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/architecture");
    await expect(page.locator(".architecture-band")).toHaveCount(5);
    await expect(page.locator(".architecture-module")).toHaveCount(20);
    await page.getByRole("button", { name: /图完整性|Graph integrity/ }).click();
    await expect(page.getByRole("region", { name:"模块详情" })).toBeVisible();
    await page.getByRole("button", { name:"关闭详情" }).click();
    await page.screenshot({ path:path.join(output, `architecture-${width}-${theme}.png`), fullPage:true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) {
      await page.getByRole("button", { name:"打开导航" }).click();
      await expect(page.getByRole("complementary", { name:"移动导航" }).getByRole("link", { name:"算法中心" })).toBeVisible();
      await expect(page.getByRole("complementary", { name:"移动导航" }).getByRole("link", { name:"系统地图" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("complementary", { name:"移动导航" })).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
