from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time

from veriflow_sandbox.resources import OutputLimitExceeded, OwnedWorkspaces, run_bounded
from veriflow_sandbox.types import CompileResult, Lang, RunResult

OUTPUT_LIMIT = 2 * 1024 * 1024


class ProcessSandbox(OwnedWorkspaces):
    # Development only: this does not provide operating-system isolation.
    name = "process"

    def compile(self, lang: Lang, source: str) -> CompileResult:
        work = self._workspace("vf-compile-")
        started = time.perf_counter()
        artifact = work / "main.py"
        keep = False
        try:
            if lang == "python3":
                artifact.write_text(source, encoding="utf-8")
                command = [sys.executable, "-m", "py_compile", str(artifact)]
            elif lang == "cpp17":
                cxx = shutil.which("g++")
                if not cxx:
                    return CompileResult(False, None, "g++ not found", 0)
                source_path = work / "main.cpp"
                source_path.write_text(source, encoding="utf-8")
                artifact = work / ("main.exe" if os.name == "nt" else "main")
                command = [cxx, "-std=c++17", "-O2", "-o", str(artifact), str(source_path)]
            else:
                return CompileResult(False, None, "unknown language", 0)
            completed = run_bounded(command, timeout=30, output_limit=OUTPUT_LIMIT)
            elapsed = int((time.perf_counter() - started) * 1000)
            if completed.returncode != 0 or not artifact.exists():
                return CompileResult(False, None, completed.stderr or completed.stdout, elapsed)
            keep = True
            return CompileResult(True, str(artifact), "", elapsed)
        except subprocess.TimeoutExpired:
            return CompileResult(False, None, "compile timeout", 30000)
        except OutputLimitExceeded:
            return CompileResult(False, None, "compile output_limit", int((time.perf_counter() - started) * 1000))
        finally:
            if not keep:
                self.cleanup(str(artifact))

    def run(self, lang: Lang, artifact: str, stdin: str,
            time_limit_ms: int, memory_limit_mb: int) -> RunResult:
        del memory_limit_mb
        timeout = max(time_limit_ms / 1000.0, 0.05)
        command = [sys.executable, artifact] if lang == "python3" else [artifact]
        started = time.perf_counter()
        try:
            completed = run_bounded(command, stdin=stdin, timeout=timeout, output_limit=OUTPUT_LIMIT)
        except OutputLimitExceeded as exc:
            return RunResult("RE", exc.stdout, exc.stderr,
                             int((time.perf_counter() - started) * 1000), detail="output_limit")
        except subprocess.TimeoutExpired as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            return RunResult("TLE", exc.stdout or "", exc.stderr or "", max(elapsed, time_limit_ms))
        elapsed = int((time.perf_counter() - started) * 1000)
        return RunResult("OK" if completed.returncode == 0 else "RE",
                         completed.stdout, completed.stderr, elapsed)
