from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from veriflow_sandbox.types import CompileResult, Lang, RunResult

OUTPUT_LIMIT = 2 * 1024 * 1024


class ProcessSandbox:
    name = "process"

    def compile(self, lang: Lang, source: str) -> CompileResult:
        work = Path(tempfile.mkdtemp(prefix="vf-compile-"))
        started = time.perf_counter()
        try:
            if lang == "python3":
                source_path = work / "main.py"
                source_path.write_text(source, encoding="utf-8")
                completed = subprocess.run(
                    [sys.executable, "-m", "py_compile", str(source_path)],
                    capture_output=True,
                    text=True,
                    timeout=20,
                    check=False,
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

            if lang == "cpp17":
                cxx = shutil.which("g++")
                if not cxx:
                    return CompileResult(
                        ok=False,
                        artifact=None,
                        log="g++ not found",
                        time_ms=0,
                    )
                source_path = work / "main.cpp"
                source_path.write_text(source, encoding="utf-8")
                binary = work / ("main.exe" if os.name == "nt" else "main")
                completed = subprocess.run(
                    [cxx, "-std=c++17", "-O2", "-o", str(binary), str(source_path)],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
                elapsed = int((time.perf_counter() - started) * 1000)
                if completed.returncode != 0 or not binary.exists():
                    return CompileResult(
                        ok=False,
                        artifact=None,
                        log=completed.stderr or completed.stdout,
                        time_ms=elapsed,
                    )
                return CompileResult(
                    ok=True, artifact=str(binary), log="", time_ms=elapsed
                )

            return CompileResult(ok=False, artifact=None, log="unknown language", time_ms=0)
        except subprocess.TimeoutExpired:
            return CompileResult(ok=False, artifact=None, log="compile timeout", time_ms=30000)

    def run(
        self,
        lang: Lang,
        artifact: str,
        stdin: str,
        time_limit_ms: int,
        memory_limit_mb: int,
    ) -> RunResult:
        del memory_limit_mb
        timeout = max(time_limit_ms / 1000.0, 0.05)
        if lang == "python3":
            command = [sys.executable, artifact]
        else:
            command = [artifact]
        started = time.perf_counter()
        try:
            completed = subprocess.run(
                command,
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            stdout = _decode(exc.stdout)
            if len(stdout.encode("utf-8", errors="replace")) > OUTPUT_LIMIT:
                return RunResult(
                    verdict="RE",
                    stdout=stdout[:8192],
                    stderr="",
                    time_ms=elapsed,
                    detail="output_limit",
                )
            return RunResult(
                verdict="TLE",
                stdout=stdout,
                stderr="",
                time_ms=max(elapsed, time_limit_ms),
            )
        elapsed = int((time.perf_counter() - started) * 1000)
        stdout = _decode(completed.stdout)
        stderr = _decode(completed.stderr)
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
                verdict="RE",
                stdout=stdout,
                stderr=stderr,
                time_ms=elapsed,
            )
        return RunResult(verdict="OK", stdout=stdout, stderr=stderr, time_ms=elapsed)


def _decode(raw: bytes | str | None) -> str:
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    return raw.decode("utf-8", errors="replace")
