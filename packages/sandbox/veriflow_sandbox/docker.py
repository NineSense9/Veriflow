from __future__ import annotations

import os
import subprocess
import tempfile
import time
from pathlib import Path

from veriflow_sandbox.types import CompileResult, Lang, RunResult

IMAGE = os.environ.get("VERIFLOW_SANDBOX_IMAGE", "veriflow-sandbox:latest")
OUTPUT_LIMIT = 2 * 1024 * 1024


class DockerSandbox:
    name = "docker"

    def compile(self, lang: Lang, source: str) -> CompileResult:
        work = Path(tempfile.mkdtemp(prefix="vf-docker-"))
        started = time.perf_counter()
        if lang == "python3":
            source_path = work / "main.py"
            source_path.write_text(source, encoding="utf-8")
            completed = _docker(
                [
                    "run",
                    "--rm",
                    "--network=none",
                    "-v",
                    f"{work}:/work",
                    "-w",
                    "/work",
                    IMAGE,
                    "python3",
                    "-m",
                    "py_compile",
                    "main.py",
                ],
                timeout=30,
            )
            elapsed = int((time.perf_counter() - started) * 1000)
            if completed.returncode != 0:
                return CompileResult(
                    ok=False,
                    artifact=None,
                    log=completed.stderr or completed.stdout,
                    time_ms=elapsed,
                )
            return CompileResult(
                ok=True, artifact=str(source_path), log="", time_ms=elapsed
            )

        source_path = work / "main.cpp"
        source_path.write_text(source, encoding="utf-8")
        completed = _docker(
            [
                "run",
                "--rm",
                "--network=none",
                "-v",
                f"{work}:/work",
                "-w",
                "/work",
                IMAGE,
                "g++",
                "-std=c++17",
                "-O2",
                "-o",
                "main",
                "main.cpp",
            ],
            timeout=30,
        )
        elapsed = int((time.perf_counter() - started) * 1000)
        binary = work / "main"
        if completed.returncode != 0 or not binary.exists():
            return CompileResult(
                ok=False,
                artifact=None,
                log=completed.stderr or completed.stdout,
                time_ms=elapsed,
            )
        return CompileResult(ok=True, artifact=str(binary), log="", time_ms=elapsed)

    def run(
        self,
        lang: Lang,
        artifact: str,
        stdin: str,
        time_limit_ms: int,
        memory_limit_mb: int,
    ) -> RunResult:
        work = Path(artifact).resolve().parent
        timeout = max(time_limit_ms / 1000.0, 0.05) + 1.0
        inner = ["python3", "main.py"] if lang == "python3" else ["./main"]
        started = time.perf_counter()
        try:
            completed = _docker(
                [
                    "run",
                    "--rm",
                    "--network=none",
                    "--read-only",
                    f"--memory={memory_limit_mb}m",
                    "--memory-swap",
                    f"{memory_limit_mb}m",
                    "--tmpfs",
                    "/tmp:rw,size=32m",
                    "-v",
                    f"{work}:/work:ro",
                    "-w",
                    "/work",
                    "-i",
                    IMAGE,
                    *inner,
                ],
                timeout=timeout,
                stdin=stdin,
            )
        except subprocess.TimeoutExpired:
            elapsed = int((time.perf_counter() - started) * 1000)
            return RunResult(verdict="TLE", stdout="", stderr="", time_ms=elapsed)
        elapsed = int((time.perf_counter() - started) * 1000)
        stdout = completed.stdout
        stderr = completed.stderr
        if "OOM" in stderr or completed.returncode == 137:
            return RunResult(
                verdict="MLE",
                stdout=stdout,
                stderr=stderr,
                time_ms=elapsed,
            )
        if len(stdout.encode("utf-8", errors="replace")) > OUTPUT_LIMIT:
            return RunResult(
                verdict="RE",
                stdout=stdout[:8192],
                stderr=stderr,
                time_ms=elapsed,
                detail="output_limit",
            )
        if completed.returncode != 0:
            return RunResult(
                verdict="RE", stdout=stdout, stderr=stderr, time_ms=elapsed
            )
        return RunResult(verdict="OK", stdout=stdout, stderr=stderr, time_ms=elapsed)


def _docker(
    args: list[str], timeout: float, stdin: str | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", *args],
        input=stdin,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
