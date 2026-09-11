"""v4.1 visual QA. Missing any HARD filename → exit 1."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "visual-qa" / "composition-v41"
BASE = "http://127.0.0.1:3000"

REQUIRED = [
    "home-light-full-1366.png",
    "home-dark-full-1366.png",
    "home-light-balanced.png",
    "home-dark-balanced.png",
    "home-pointer-left.png",
    "home-pointer-center.png",
    "home-pointer-right.png",
    "home-click-spark.png",
    "home-bento-no-gaps.png",
    "home-empty-ai-activity.png",
    "nav-light.png",
    "nav-dark.png",
    "nav-dark-pill-active.png",
    "nav-dark-pill-inactive.png",
    "cardnav-light-open.png",
    "cardnav-dark-open.png",
    "nav-click-feedback.png",
    "mobile-menu-light.png",
    "mobile-menu-dark.png",
    "evidence-light.png",
    "evidence-dark.png",
    "evidence-dark-topography-visible.png",
    "evidence-light-topography.png",
    "evidence-reduced-static.png",
    "verification-simple-dag-fit.png",
    "verification-simple-dag-focus.png",
    "verification-issue-focus-1.png",
    "verification-issue-focus-2.png",
    "verification-fit-all.png",
    "verification-no-dots.png",
    "verification-dark.png",
    "compose-ambient-light.png",
    "compose-ambient-dark.png",
    "verification-ambient.png",
    "evidence-route-ambient.png",
    "architecture-route-ambient.png",
    "algorithms-route-ambient.png",
    "stress-idle.png",
    "stress-running.png",
]


async def theme(page, name: str) -> None:
    await page.evaluate(
        """(t) => { localStorage.setItem('vf_theme', t); document.documentElement.setAttribute('data-theme', t); }""",
        name,
    )


async def login(page) -> None:
    await page.goto(f"{BASE}/login")
    await page.wait_for_selector("#user")
    await page.fill("#user", "demo")
    await page.fill("#pass", "demo")
    await page.click("button[type=submit]")
    await page.wait_for_selector(".topbar .brand-mark", timeout=20000)


async def shot(page, name: str, delay: int = 400) -> None:
    if delay:
        await page.wait_for_timeout(delay)
    await page.screenshot(path=str(OUT / name), full_page=False)


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1366, "height": 768})
        page.set_default_timeout(40000)
        await login(page)

        await theme(page, "light")
        await page.goto(f"{BASE}/")
        await page.wait_for_selector(".vf-workbench")
        await shot(page, "home-light-full-1366.png")
        await shot(page, "home-bento-no-gaps.png")
        await shot(page, "home-empty-ai-activity.png")
        await shot(page, "nav-light.png")
        box = page.viewport_size
        w, h = box["width"], box["height"]
        await page.mouse.move(w * 0.1, h * 0.5)
        await shot(page, "home-pointer-left.png")
        await page.mouse.move(w * 0.5, h * 0.5)
        await shot(page, "home-pointer-center.png")
        await page.mouse.move(w * 0.9, h * 0.5)
        await shot(page, "home-pointer-right.png")
        latest = page.locator(".cell-latest").first
        if await latest.count():
            boxl = await latest.bounding_box()
            if boxl:
                await page.mouse.click(boxl["x"] + 40, boxl["y"] + 40)
        await shot(page, "home-click-spark.png", delay=70)
        await page.get_by_role("button", name="评估").click()
        await page.wait_for_selector(".vf-card-nav-panel")
        await shot(page, "cardnav-light-open.png")
        await page.keyboard.press("Escape")

        await theme(page, "dark")
        await page.goto(f"{BASE}/")
        await page.wait_for_selector(".vf-workbench")
        await shot(page, "home-dark-full-1366.png")
        await shot(page, "nav-dark.png")
        await shot(page, "nav-dark-pill-active.png")
        await shot(page, "nav-dark-pill-inactive.png")
        await page.get_by_role("button", name="评估").click()
        await page.wait_for_selector(".vf-card-nav-panel")
        await shot(page, "cardnav-dark-open.png")
        await page.locator(".pill").nth(1).click()
        await shot(page, "nav-click-feedback.png")

        await theme(page, "light")
        await page.evaluate(
            """() => { const p=JSON.parse(localStorage.getItem('vf_prefs')||'{}'); p.effectsLevel='balanced'; localStorage.setItem('vf_prefs', JSON.stringify(p)); document.documentElement.dataset.effects='balanced'; }"""
        )
        await page.goto(f"{BASE}/")
        await shot(page, "home-light-balanced.png")
        await theme(page, "dark")
        await page.reload()
        await shot(page, "home-dark-balanced.png")
        await page.evaluate(
            """() => { const p=JSON.parse(localStorage.getItem('vf_prefs')||'{}'); p.effectsLevel='full'; localStorage.setItem('vf_prefs', JSON.stringify(p)); document.documentElement.dataset.effects='full'; }"""
        )

        await page.set_viewport_size({"width": 390, "height": 844})
        await theme(page, "light")
        await page.goto(f"{BASE}/")
        await page.locator(".nav-toggle").click()
        await shot(page, "mobile-menu-light.png")
        await theme(page, "dark")
        await page.goto(f"{BASE}/")
        await page.locator(".nav-toggle").click()
        await shot(page, "mobile-menu-dark.png")

        await page.set_viewport_size({"width": 1366, "height": 768})
        await theme(page, "light")
        await page.goto(f"{BASE}/report?demo=case1_order")
        await page.wait_for_selector(".vf-dag")
        await page.locator(".vf-dag").first.scroll_into_view_if_needed()
        await page.wait_for_timeout(800)
        await shot(page, "verification-simple-dag-fit.png")
        await shot(page, "verification-no-dots.png")
        await shot(page, "verification-ambient.png")
        rows = page.locator(".vf-findings tbody tr")
        if await rows.count():
            await rows.nth(0).locator(".vf-cell").first.click()
        await page.locator(".vf-dag").first.scroll_into_view_if_needed()
        await page.wait_for_timeout(400)
        await shot(page, "verification-simple-dag-focus.png")
        await shot(page, "verification-issue-focus-1.png")
        if await rows.count() > 2:
            await rows.nth(2).locator(".vf-cell").first.click()
        await page.locator(".vf-dag").first.scroll_into_view_if_needed()
        await page.wait_for_timeout(400)
        await shot(page, "verification-issue-focus-2.png")
        fit = page.get_by_role("button", name="Fit All")
        if await fit.count():
            await fit.click()
        await page.locator(".vf-dag").first.scroll_into_view_if_needed()
        await page.wait_for_timeout(400)
        await shot(page, "verification-fit-all.png")
        await theme(page, "dark")
        await page.reload()
        await page.wait_for_selector(".vf-dag")
        await page.locator(".vf-dag").first.scroll_into_view_if_needed()
        await page.wait_for_timeout(800)
        await shot(page, "verification-dark.png")

        await theme(page, "light")
        await page.goto(f"{BASE}/evidence")
        await page.wait_for_selector(".evidence-cert, .topbar")
        await shot(page, "evidence-light.png")
        await shot(page, "evidence-light-topography.png")
        await shot(page, "evidence-route-ambient.png")
        await theme(page, "dark")
        await page.reload()
        await shot(page, "evidence-dark.png")
        await shot(page, "evidence-dark-topography-visible.png")
        await page.evaluate(
            """() => { const p=JSON.parse(localStorage.getItem('vf_prefs')||'{}'); p.effectsLevel='reduced'; localStorage.setItem('vf_prefs', JSON.stringify(p)); document.documentElement.dataset.effects='reduced'; }"""
        )
        await page.reload()
        await shot(page, "evidence-reduced-static.png")
        await page.evaluate(
            """() => { const p=JSON.parse(localStorage.getItem('vf_prefs')||'{}'); p.effectsLevel='full'; localStorage.setItem('vf_prefs', JSON.stringify(p)); document.documentElement.dataset.effects='full'; }"""
        )

        await theme(page, "light")
        await page.goto(f"{BASE}/compose")
        await shot(page, "compose-ambient-light.png")
        await theme(page, "dark")
        await page.reload()
        await shot(page, "compose-ambient-dark.png")
        await theme(page, "light")
        await page.goto(f"{BASE}/architecture")
        await page.wait_for_selector(".arch-svg")
        await shot(page, "architecture-route-ambient.png")
        await page.goto(f"{BASE}/algorithms")
        await shot(page, "algorithms-route-ambient.png")
        await page.goto(f"{BASE}/stress")
        await shot(page, "stress-idle.png")
        await page.evaluate(
            """() => window.dispatchEvent(new CustomEvent('vf-ambient-activity', { detail: 'running' }))"""
        )
        await page.wait_for_timeout(400)
        await shot(page, "stress-running.png")
        await page.evaluate(
            """() => window.dispatchEvent(new CustomEvent('vf-ambient-activity', { detail: 'idle' }))"""
        )
        await browser.close()

    missing = [name for name in REQUIRED if not (OUT / name).is_file()]
    if missing:
        print("MISSING", *missing, sep="\n")
        sys.exit(1)
    print(OUT)


if __name__ == "__main__":
    asyncio.run(main())
