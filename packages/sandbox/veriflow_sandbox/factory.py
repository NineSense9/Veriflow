from __future__ import annotations

import os
import subprocess

from veriflow_sandbox.docker import DockerSandbox
from veriflow_sandbox.process import ProcessSandbox
from veriflow_sandbox.types import Sandbox


def docker_available() -> bool:
    try:
        completed = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0


def sandbox_mode() -> str:
    requested = os.environ.get("VERIFLOW_SANDBOX", "auto").strip().lower()
    if requested == "docker":
        return "docker" if docker_available() else "sandbox_down"
    if requested == "process":
        return "process"
    if docker_available():
        return "docker"
    return "process"


def get_sandbox() -> Sandbox:
    mode = sandbox_mode()
    if mode == "docker":
        return DockerSandbox()
    return ProcessSandbox()
