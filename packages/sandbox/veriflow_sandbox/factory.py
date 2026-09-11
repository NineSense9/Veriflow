from __future__ import annotations

import os
import subprocess
import time

from veriflow_sandbox.docker import DockerSandbox
from veriflow_sandbox.process import ProcessSandbox
from veriflow_sandbox.types import Sandbox

_docker_cache: tuple[float, bool] | None = None


def docker_available() -> bool:
    global _docker_cache
    now = time.monotonic()
    if _docker_cache and now - _docker_cache[0] < 60:
        return _docker_cache[1]
    try:
        completed = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=1.5,
            check=False,
        )
        ok = completed.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        ok = False
    _docker_cache = (now, ok)
    return ok


def sandbox_mode() -> str:
    requested = os.environ.get("VERIFLOW_SANDBOX", "auto").strip().lower()
    if requested == "docker":
        return "docker" if docker_available() else "sandbox_down"
    if requested == "process":
        return "process"
    if docker_available():
        return "docker"
    return "process"


class SandboxUnavailable(RuntimeError):
    """Production fail-closed: docker requested but not healthy."""


def get_sandbox() -> Sandbox:
    mode = sandbox_mode()
    if mode == "sandbox_down":
        raise SandboxUnavailable("VERIFLOW_SANDBOX=docker but docker is unavailable")
    if mode == "docker":
        return DockerSandbox()
    return ProcessSandbox()
