from __future__ import annotations

import os
from pathlib import Path

APP_VERSION = "0.2.0"
VERIFIER_VERSION = "1.1.0"


def _git_from_repo() -> str | None:
    root = Path(__file__).resolve().parents[3]
    git = root / ".git"
    if not git.exists():
        return None
    try:
        import subprocess

        out = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=2,
        )
        return out.strip() or None
    except Exception:  # noqa: BLE001
        return None


def version_payload() -> dict[str, str | None]:
    injected = os.environ.get("VERIFLOW_GIT_COMMIT", "").strip()
    commit = injected or _git_from_repo()
    build_time = os.environ.get("VERIFLOW_BUILD_TIME", "").strip() or None
    return {
        "git_commit": commit or None,
        "build_time": build_time,
        "app_version": os.environ.get("VERIFLOW_APP_VERSION", APP_VERSION),
        "verifier_version": VERIFIER_VERSION,
    }
