from __future__ import annotations

import os
import subprocess
import threading
import time
import uuid
from pathlib import Path

from veriflow_sandbox.resources import OutputLimitExceeded, OwnedWorkspaces, run_bounded
from veriflow_sandbox.types import CompileResult, Lang, RunResult, SandboxError

IMAGE = os.environ.get("VERIFLOW_SANDBOX_IMAGE", "veriflow-sandbox:latest")
OUTPUT_LIMIT = 2 * 1024 * 1024
SLOT_WAIT_SECONDS = 5.0
# A single operation keeps the sandbox budget below 512 MiB on the shared host.
_DOCKER_SLOTS = threading.BoundedSemaphore(1)


class DockerSandbox(OwnedWorkspaces):
    name = "docker"

    def compile(self, lang: Lang, source: str) -> CompileResult:
        if lang not in ("python3", "cpp17"):
            return CompileResult(False, None, "unknown language", 0)
        work = self._workspace("vf-docker-")
        # The compiler runs as nobody; only its own private build directory is writable.
        source_path = work / ("main.py" if lang == "python3" else "main.cpp")
        artifact = source_path if lang == "python3" else work / "main"
        keep = False
        started = time.perf_counter()
        try:
            work.chmod(0o777)
            source_path.write_text(source, encoding="utf-8")
            source_path.chmod(0o644)
            # Validate without creating a nobody-owned __pycache__ on the host mount.
            inner = (["python3", "-c", "from pathlib import Path; compile(Path('main.py').read_bytes(), 'main.py', 'exec')"] if lang == "python3"
                     else ["g++", "-std=c++17", "-O2", "-o", "main", "main.cpp"])
            try:
                completed = _container(work, inner, timeout=30, memory_mb=512, writable=True)
            except subprocess.TimeoutExpired:
                return CompileResult(False, None, "compile timeout", _elapsed(started))
            except OutputLimitExceeded:
                return CompileResult(False, None, "compile output_limit", _elapsed(started))
            if completed.returncode != 0 or not artifact.exists():
                return CompileResult(False, None, completed.stderr or completed.stdout, _elapsed(started))
            keep = True
            return CompileResult(True, str(artifact), "", _elapsed(started))
        finally:
            if not keep:
                self.cleanup(str(artifact))

    def run(self, lang: Lang, artifact: str, stdin: str,
            time_limit_ms: int, memory_limit_mb: int) -> RunResult:
        work = Path(artifact).resolve().parent
        inner = ["python3", "main.py"] if lang == "python3" else ["./main"]
        started = time.perf_counter()
        try:
            completed = _container(
                work, inner, timeout=max(time_limit_ms / 1000.0, 0.05) + 1.0,
                memory_mb=max(16, min(memory_limit_mb, 512)), stdin=stdin,
            )
        except subprocess.TimeoutExpired:
            return RunResult("TLE", "", "", _elapsed(started))
        except OutputLimitExceeded as exc:
            return RunResult("RE", exc.stdout, exc.stderr, _elapsed(started), detail="output_limit")
        elapsed = _elapsed(started)
        if completed.returncode == 137:
            return RunResult("MLE", completed.stdout, completed.stderr, elapsed)
        if completed.returncode != 0:
            return RunResult("RE", completed.stdout, completed.stderr, elapsed)
        return RunResult("OK", completed.stdout, completed.stderr, elapsed)


def _elapsed(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def _container(work: Path, inner: list[str], *, timeout: float, memory_mb: int,
               writable: bool = False, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    if not _DOCKER_SLOTS.acquire(timeout=SLOT_WAIT_SECONDS):
        raise SandboxError("sandbox_busy")
    name = f"vf-sandbox-{uuid.uuid4().hex}"
    args = [
        "run", "--rm", "--name", name, "--network=none", "--read-only",
        "--cpus=1", "--pids-limit=64", "--cap-drop=ALL",
        "--security-opt=no-new-privileges", "--user=65534:65534",
        f"--memory={memory_mb}m", f"--memory-swap={memory_mb}m",
        "--ulimit", "fsize=67108864:67108864",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m", "-v",
        f"{work}:/work" + ("" if writable else ":ro"),
        "-w", "/work", "-i", IMAGE, *inner,
    ]
    try:
        try:
            try:
                completed = _docker(args, timeout=timeout, stdin=stdin)
            except OSError as exc:
                raise SandboxError("sandbox_unavailable") from exc
            if completed.returncode in (125, 126, 127):
                raise SandboxError("sandbox_unavailable")
            return completed
        finally:
            # Killing the Docker CLI alone does not stop its container.
            # Force removal also covers a daemon-side run surviving a CLI error.
            try:
                removed = _docker(["rm", "-f", name], timeout=5)
            except (OSError, subprocess.TimeoutExpired, OutputLimitExceeded) as exc:
                raise SandboxError("sandbox_cleanup_failed") from exc
            if removed.returncode != 0 and "No such container" not in removed.stderr:
                raise SandboxError("sandbox_cleanup_failed")
    finally:
        _DOCKER_SLOTS.release()


def _docker(args: list[str], timeout: float, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return run_bounded(["docker", *args], stdin=stdin, timeout=timeout, output_limit=OUTPUT_LIMIT)
