"""Composition v4 visual QA. Enforces the approved filename list."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "visual-qa" / "composition-v4"
BASE = "http://127.0.0.1:3000"

REQUIRED = [
    "01-home-light-1366.png",
    "02-home-dark-1366.png",
    "03-home-light-full-width.png",
    "04-home-bento-hover.png",
    "05-home-ai-activity.png",
    "06-nav-light.png",
    "07-nav-dark.png",
    "08-cardnav-open-light.png",
    "09-cardnav-open-dark.png",
    "10-mobile-staggered-menu.png",
    "11-verification-clean-graph.png",
    "12-verification-selected-node.png",
    "13-verification-witness.png",
    "14-verification-runtime-replay.png",
    "15-verification-dark.png",
    "16-architecture-overview-light.png",
    "17-architecture-overview-dark.png",
    "18-architecture-ai-lens.png",
    "19-architecture-repair-lens.png",
    "20-architecture-story.png",
    "21-architecture-drawer.png",
    "22-architecture-mobile.png",
    "23-evidence-light.png",
    "24-evidence-dark.png",
    "25-evidence-header-topography.png",
    "26-algorithms-light.png",
    "27-algorithms-dark.png",
    "28-settings-light.png",
    "29-settings-dark.png",
    "30-login-light.png",
    "31-login-dark.png",
    "fx-faulty-terminal-light.png",
    "fx-faulty-terminal-dark.png",
    "fx-magic-bento-light.png",
    "fx-magic-bento-dark.png",
    "fx-spotlight-light.png",
    "fx-spotlight-dark.png",
    "fx-chroma-grid-light.png",
    "fx-chroma-grid-dark.png",
    "fx-card-nav-light.png",
    "fx-card-nav-dark.png",
    "fx-architecture-light.png",
    "fx-architecture-dark.png",
    "fx-evidence-topography-light.png",
    "fx-evidence-topography-dark.png",
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


async def shot(page, name: str) -> None:
    await page.wait_for_timeout(500)
    await page.screenshot(path=str(OUT / name), full_page=False)


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1366, "height": 768})
        page.set_default_timeout(40000)
        await page.goto(f"{BASE}/login")
        await theme(page, "light")
        await page.reload()
        await page.wait_for_selector("#user")
        await shot(page, "30-login-light.png")
        await theme(page, "dark")
        await page.reload()
        await page.wait_for_selector("#user")
        await shot(page, "31-login-dark.png")
        await theme(page, "light")
        await login(page)

        await page.set_viewport_size({"width": 1366, "height": 768})
        await page.goto(f"{BASE}/")
        await page.wait_for_selector(".topbar .brand-mark")
        await shot(page, "01-home-light-1366.png")
        await shot(page, "03-home-light-full-width.png")
        await shot(page, "05-home-ai-activity.png")
        await shot(page, "fx-faulty-terminal-light.png")
        await shot(page, "fx-magic-bento-light.png")
        await shot(page, "fx-spotlight-light.png")
        bento = page.locator(".vf-workbench")
        if await bento.count():
            box = await bento.first.bounding_box()
            if box:
                await page.mouse.move(box["x"] + box["width"] * 0.4, box["y"] + 80)
        await shot(page, "04-home-bento-hover.png")
        await shot(page, "06-nav-light.png")
        await page.get_by_role("button", name="评估").click()
        await shot(page, "08-cardnav-open-light.png")
        await shot(page, "fx-card-nav-light.png")
        await page.keyboard.press("Escape")

        await theme(page, "dark")
        await page.goto(f"{BASE}/")
        await page.wait_for_selector(".topbar .brand-mark")
        await shot(page, "02-home-dark-1366.png")
        await shot(page, "07-nav-dark.png")
        await shot(page, "fx-faulty-terminal-dark.png")
        await shot(page, "fx-magic-bento-dark.png")
        await shot(page, "fx-spotlight-dark.png")
        await page.get_by_role("button", name="评估").click()
        await shot(page, "09-cardnav-open-dark.png")
        await shot(page, "fx-card-nav-dark.png")
        await page.keyboard.press("Escape")

        await theme(page, "light")
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.goto(f"{BASE}/")
        await page.wait_for_selector(".nav-toggle")
        await page.locator(".nav-toggle").click()
        await shot(page, "10-mobile-staggered-menu.png")

        await page.set_viewport_size({"width": 1366, "height": 768})
        await page.goto(f"{BASE}/report?demo=case1_order")
        await page.wait_for_selector(".topbar .brand-mark")
        await page.wait_for_timeout(1200)
        await shot(page, "11-verification-clean-graph.png")
        issue = page.locator(".vf-cell").first
        if await issue.count():
            await issue.click()
        await shot(page, "12-verification-selected-node.png")
        await shot(page, "13-verification-witness.png")
        await page.goto(f"{BASE}/report?demo=case4_runtime")
        await page.wait_for_selector(".topbar .brand-mark")
        await page.wait_for_timeout(1200)
        await shot(page, "14-verification-runtime-replay.png")
        await theme(page, "dark")
        await page.reload()
        await page.wait_for_selector(".topbar .brand-mark")
        await shot(page, "15-verification-dark.png")

        await theme(page, "light")
        await page.goto(f"{BASE}/architecture")
        await page.wait_for_selector(".arch-svg")
        await shot(page, "16-architecture-overview-light.png")
        await shot(page, "fx-architecture-light.png")
        await page.get_by_role("button", name="AI", exact=True).click()
        await shot(page, "18-architecture-ai-lens.png")
        await page.get_by_role("button", name="Repair", exact=True).click()
        await shot(page, "19-architecture-repair-lens.png")
        await page.get_by_role("button", name="Story: AI → Proof → Repair", exact=True).click()
        await page.wait_for_timeout(800)
        await shot(page, "20-architecture-story.png")
        node = page.locator(".arch-node").first
        if await node.count():
            await node.click()
        await shot(page, "21-architecture-drawer.png")
        await theme(page, "dark")
        await page.goto(f"{BASE}/architecture")
        await page.wait_for_selector(".arch-svg")
        await shot(page, "17-architecture-overview-dark.png")
        await shot(page, "fx-architecture-dark.png")
        await page.set_viewport_size({"width": 390, "height": 844})
        await theme(page, "light")
        await page.goto(f"{BASE}/architecture")
        await page.wait_for_selector(".arch-svg")
        await shot(page, "22-architecture-mobile.png")

        await page.set_viewport_size({"width": 1366, "height": 768})
        await page.goto(f"{BASE}/evidence")
        await page.wait_for_selector(".topbar .brand-mark")
        await shot(page, "23-evidence-light.png")
        await shot(page, "25-evidence-header-topography.png")
        await shot(page, "fx-evidence-topography-light.png")
        await theme(page, "dark")
        await page.reload()
        await shot(page, "24-evidence-dark.png")
        await shot(page, "fx-evidence-topography-dark.png")

        await theme(page, "light")
        await page.goto(f"{BASE}/algorithms")
        await page.wait_for_selector(".chroma-grid, .ghost")
        await shot(page, "26-algorithms-light.png")
        await shot(page, "fx-chroma-grid-light.png")
        await theme(page, "dark")
        await page.reload()
        await shot(page, "27-algorithms-dark.png")
        await shot(page, "fx-chroma-grid-dark.png")

        await theme(page, "light")
        await page.goto(f"{BASE}/settings")
        await page.wait_for_selector(".topbar .brand-mark")
        await shot(page, "28-settings-light.png")
        await theme(page, "dark")
        await page.reload()
        await shot(page, "29-settings-dark.png")
        await browser.close()

    missing = [name for name in REQUIRED if not (OUT / name).is_file()]
    if missing:
        print("MISSING", *missing, sep="\n")
        sys.exit(1)
    print(OUT)


if __name__ == "__main__":
    asyncio.run(main())
