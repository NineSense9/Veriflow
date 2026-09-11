"""Capture Interactive Experience v3 visual QA into artifacts/visual-qa/round-v3/."""

from __future__ import annotations

import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "visual-qa" / "round-v3"

SHOTS = [
    ("home-light", "/", "light", 1440, 900),
    ("home-dark", "/", "dark", 1440, 900),
    ("verification-playback-after-run", "/report?demo=case4_runtime", "light", 1440, 900),
    ("verification-issue", "/report?demo=case1_order", "light", 1440, 900),
    ("evidence-record", "/evidence", "light", 1440, 900),
    ("benchmark", "/benchmark", "light", 1440, 900),
    ("algorithms", "/algorithms", "light", 1440, 900),
    ("stress-mismatch", "/stress", "light", 1440, 900),
    ("settings-ai", "/settings", "light", 1440, 900),
    ("settings-appearance", "/settings#settings-appearance", "light", 1440, 900),
    ("settings-effects", "/settings#settings-effects", "light", 1440, 900),
    ("settings-lab", "/settings#settings-lab", "light", 1440, 900),
    ("architecture-overview", "/architecture", "light", 1440, 900),
    ("architecture-ai-lens", "/architecture", "light", 1440, 900),
    ("topnav-active", "/", "light", 1440, 900),
    ("1366x768-home", "/", "light", 1366, 768),
    ("1366x768-verification", "/report?demo=case4_runtime", "light", 1366, 768),
    ("1366x768-architecture", "/architecture", "light", 1366, 768),
    ("390-settings", "/settings", "light", 390, 844),
    ("390-verification", "/report?demo=case4_runtime", "light", 390, 844),
    ("390-architecture", "/architecture", "light", 390, 844),
    ("compose-ai-fallback", "/compose", "light", 1440, 900),
    ("dag-witness", "/report?demo=case1_order", "light", 1440, 900),
    ("runtime-replay-mid", "/report?demo=case4_runtime", "light", 1440, 900),
]


async def login(page) -> None:
    await page.goto("http://127.0.0.1:3000/login")
    await page.wait_for_selector("#user")
    await page.fill("#user", "demo")
    await page.fill("#pass", "demo")
    await page.click("button[type=submit]")
    await page.wait_for_selector(".topbar .brand-mark", timeout=20000)


async def shot(page, name: str, route: str, theme: str, w: int, h: int) -> None:
    await page.set_viewport_size({"width": w, "height": h})
    await page.evaluate(
        """(t) => { localStorage.setItem('vf_theme', t); document.documentElement.setAttribute('data-theme', t); }""",
        theme,
    )
    await page.goto(f"http://127.0.0.1:3000{route}")
    await page.wait_for_selector(".topbar .brand-mark", timeout=20000)
    if name.startswith("architecture-ai"):
        btn = page.get_by_role("button", name="AI")
        if await btn.count():
            await btn.first.click()
    await page.wait_for_timeout(800)
    await page.screenshot(path=str(OUT / f"{name}.png"), full_page=False)


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(40000)
        await page.goto("http://127.0.0.1:3000/login")
        await page.wait_for_selector("#user")
        await page.screenshot(path=str(OUT / "icon-light.png"), full_page=False)
        await page.evaluate(
            """() => { localStorage.setItem('vf_theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); }"""
        )
        await page.reload()
        await page.wait_for_selector("#user")
        await page.screenshot(path=str(OUT / "icon-dark.png"), full_page=False)
        await page.screenshot(path=str(OUT / "favicon-preview.png"), full_page=False)
        await login(page)
        for name, route, theme, w, h in SHOTS:
            await shot(page, name, route, theme, w, h)
        await browser.close()
    print(OUT)


if __name__ == "__main__":
    asyncio.run(main())
