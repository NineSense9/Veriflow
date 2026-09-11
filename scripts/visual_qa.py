"""Screenshot key routes in light/dark. Requires running API+web."""

from __future__ import annotations

import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "visual-qa"
ROUTES = ["/", "/report?demo=case4_runtime", "/evidence", "/history", "/algorithms", "/benchmark", "/compose", "/stress"]


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(40000)
        await page.goto("http://127.0.0.1:3000/login")
        for theme in ("light", "dark"):
            await page.evaluate(
                """(t) => { localStorage.setItem('vf_theme', t); document.documentElement.setAttribute('data-theme', t); }""",
                theme,
            )
            await page.goto("http://127.0.0.1:3000/login")
            await page.wait_for_selector("#user")
            await page.wait_for_timeout(300)
            await page.screenshot(path=str(OUT / f"login-{theme}-desktop.png"), full_page=False)
        await page.evaluate(
            """() => { localStorage.setItem('vf_theme', 'light'); document.documentElement.setAttribute('data-theme', 'light'); }"""
        )
        await page.goto("http://127.0.0.1:3000/login")
        await page.fill("#user", "demo")
        await page.fill("#pass", "demo")
        await page.click("button[type=submit]")
        await page.wait_for_selector(".topbar .brand-mark", timeout=20000)
        for theme in ("light", "dark"):
            await page.evaluate(
                """(t) => { localStorage.setItem('vf_theme', t); document.documentElement.setAttribute('data-theme', t); }""",
                theme,
            )
            for route in ROUTES:
                slug = route.strip("/").split("?")[0] or "home"
                await page.goto(f"http://127.0.0.1:3000{route}")
                await page.wait_for_selector(".topbar .brand-mark")
                await page.wait_for_timeout(700)
                await page.screenshot(path=str(OUT / f"{slug}-{theme}-desktop.png"), full_page=False)
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.goto("http://127.0.0.1:3000/report?demo=case4_runtime")
            await page.wait_for_selector(".topbar .brand-mark")
            await page.wait_for_timeout(700)
            await page.screenshot(path=str(OUT / f"report-{theme}-mobile.png"), full_page=False)
            await page.set_viewport_size({"width": 1440, "height": 900})
        await page.evaluate(
            """() => { localStorage.setItem('vf_theme', 'light'); document.documentElement.setAttribute('data-theme', 'light'); }"""
        )
        await page.goto("http://127.0.0.1:3000/")
        await page.wait_for_selector(".topbar .brand-mark")
        await page.locator(".topbar .brand").first.screenshot(path=str(OUT / "logo-light.png"))
        await page.evaluate(
            """() => { localStorage.setItem('vf_theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); }"""
        )
        await page.reload()
        await page.wait_for_selector(".topbar .brand-mark")
        await page.locator(".topbar .brand").first.screenshot(path=str(OUT / "logo-dark.png"))
        await browser.close()
    print(OUT)


if __name__ == "__main__":
    asyncio.run(main())
