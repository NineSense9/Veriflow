"""Playwright demo smoke: login → home → case4 report. Requires API+web."""

from __future__ import annotations

import asyncio
import sys

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3000"


async def main() -> int:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1366, "height": 768})
        page.set_default_timeout(40000)
        await page.goto(f"{BASE}/login")
        await page.fill("#user", "demo")
        await page.fill("#pass", "demo")
        await page.click("button[type=submit]")
        await page.wait_for_selector(".topbar .brand-mark")
        await page.goto(f"{BASE}/")
        await page.wait_for_selector("text=AI proposes")
        await page.goto(f"{BASE}/report?demo=case4_runtime")
        await page.wait_for_selector("text=静态可达")
        await page.wait_for_selector("text=运行时模拟")
        body = await page.inner_text("body")
        if "BLOCKED" not in body:
            print("FAIL: expected Gate BLOCKED")
            return 1
        if "Executable" in body and "静态可达" not in body:
            print("FAIL: still showing conflicting Executable label")
            return 1
        await page.goto(f"{BASE}/history")
        await page.wait_for_selector("text=验证历史")
        await browser.close()
    print("SMOKE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
