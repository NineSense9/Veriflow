"""VeriFlow Local Offline Demo Runner.

Designed for live competition presentations and offline defense.
Launches the local FastAPI backend (port 8010) and Next.js frontend (port 3000),
polls for health, opens default browser, and cleanly terminates on Ctrl+C.
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT_DIR / "apps" / "web"

API_PORT = 8010
WEB_PORT = 3000
API_URL = f"http://127.0.0.1:{API_PORT}"
WEB_URL = f"http://127.0.0.1:{WEB_PORT}"


def check_port(url: str, timeout: float = 1.0) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VeriFlow-HealthCheck"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 304)
    except Exception:
        return False


def main():
    print("=" * 66)
    print("   VeriFlow 竞赛双核训练平台 · 本地极速离线演示引擎")
    print("   (比赛答辩防翻车保命系统 · 100% 离线脱机支持)")
    print("=" * 66)

    # 1. Ensure environment variables
    env = os.environ.copy()
    env["VERIFLOW_API_ORIGIN"] = API_URL
    env["VERIFLOW_SANDBOX"] = env.get("VERIFLOW_SANDBOX", "process")
    env["VERIFLOW_SECRET_KEY"] = env.get("VERIFLOW_SECRET_KEY", "local-demo-secret-key-32-chars-minimum-ok")
    env["PORT"] = str(WEB_PORT)

    # 2. Database seed check
    print("[1/4] 正在检查与就绪本地数据库...")
    try:
        from veriflow_api.db import init_db
        from veriflow_api.seed import seed
        init_db()
        seed()
        print("      ✓ 本地题目与验证测试集初始化完成")
    except Exception as exc:
        print(f"      ! 数据库初始化警告: {exc}")

    # 3. Start API backend subprocess
    print(f"[2/4] 正在启动 FastAPI 本地双核验证后端 ({API_URL})...")
    api_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "veriflow_api.main:create_app",
        "--factory",
        "--host",
        "127.0.0.1",
        "--port",
        str(API_PORT),
        "--log-level",
        "warning",
    ]
    api_proc = subprocess.Popen(
        api_cmd,
        cwd=str(ROOT_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    # 4. Start Next.js web frontend subprocess
    print(f"[3/4] 正在启动 Next.js 极速演示前端 ({WEB_URL})...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    web_cmd = [npm_cmd, "run", "dev"]
    web_proc = subprocess.Popen(
        web_cmd,
        cwd=str(WEB_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    # 5. Wait for services to become healthy
    print("[4/4] 正在等待双核服务健康检查探活...")
    start_time = time.time()
    api_healthy = False
    web_healthy = False

    while time.time() - start_time < 35:
        if not api_healthy and check_port(f"{API_URL}/api/health"):
            api_healthy = True
            print("      ✓ API 后端已上线并健康响应")
        if not web_healthy and check_port(WEB_URL):
            web_healthy = True
            print("      ✓ 前端页面已上线并完成渲染")
        if api_healthy and web_healthy:
            break
        time.sleep(0.6)

    if not api_healthy or not web_healthy:
        print("\n[提示] 服务启动中，尝试唤起浏览器...")

    print("\n" + "=" * 66)
    print(f"   ✓ 平台已就绪！")
    print(f"   - 首页大厅:             {WEB_URL}/")
    print(f"   - 选手竞技场 / 题库训练: {WEB_URL}/problems")
    print(f"   - 出题质检全链路看板:   {WEB_URL}/report?tour=1")
    print(f"   - 智能对拍模糊测试:     {WEB_URL}/stress")
    print("=" * 66)
    print("   [提示] 正在自动打开默认浏览器直达系统...")
    print("   [操作] 演示结束后，按下 Ctrl+C 即可安全停止全部本地服务。\n")

    try:
        webbrowser.open(f"{WEB_URL}/")
    except Exception:
        pass

    try:
        while True:
            time.sleep(1)
            if api_proc.poll() is not None:
                print("API 进程已退出，正在清理...")
                break
            if web_proc.poll() is not None:
                print("Web 前端进程已退出，正在清理...")
                break
    except KeyboardInterrupt:
        print("\n收到退出指令 (Ctrl+C)，正在安全关闭本地服务...")
    finally:
        for proc in [api_proc, web_proc]:
            try:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait(timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        print("✓ 所有本地服务已安全停止。祝比赛答辩顺利夺冠！")


if __name__ == "__main__":
    main()
