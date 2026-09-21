from __future__ import annotations

import os
import shutil
import signal
import subprocess
import tempfile
import threading
from pathlib import Path


class OutputLimitExceeded(RuntimeError):
    def __init__(self, stdout: str, stderr: str):
        self.stdout = stdout
        self.stderr = stderr
        super().__init__("output_limit")


def run_bounded(
    command: list[str], *, timeout: float, output_limit: int, stdin: str | None = None
) -> subprocess.CompletedProcess[str]:
    """Drain both pipes concurrently, retaining at most output_limit bytes total."""
    process = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=os.name != "nt",
    )
    buffers = [bytearray(), bytearray()]
    lock = threading.Lock()
    overflow = threading.Event()

    def kill() -> None:
        try:
            if os.name != "nt":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        except ProcessLookupError:
            pass

    def drain(pipe, index: int) -> None:
        try:
            while chunk := pipe.read1(8192):
                with lock:
                    room = max(0, output_limit - sum(map(len, buffers)))
                    buffers[index].extend(chunk[:room])
                    if len(chunk) > room:
                        overflow.set()
                        kill()
                        return
        finally:
            pipe.close()

    def feed() -> None:
        try:
            process.stdin.write((stdin or "").encode("utf-8"))
            process.stdin.flush()
        except (BrokenPipeError, OSError):
            pass
        finally:
            process.stdin.close()

    readers = [threading.Thread(target=drain, args=(pipe, i), daemon=True)
               for i, pipe in enumerate((process.stdout, process.stderr))]
    writer = threading.Thread(target=feed, daemon=True)
    for thread in [*readers, writer]:
        thread.start()
    timed_out = False
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        kill()
        process.wait(timeout=5)
    finally:
        if process.poll() is None:
            kill()
            process.wait(timeout=5)
        for thread in [*readers, writer]:
            thread.join(timeout=1)
    stdout, stderr = (bytes(buf).decode("utf-8", errors="replace") for buf in buffers)
    if overflow.is_set():
        raise OutputLimitExceeded(stdout, stderr)
    if timed_out:
        raise subprocess.TimeoutExpired(command, timeout, output=stdout, stderr=stderr)
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


class OwnedWorkspaces:
    """Only delete directories created by this sandbox instance."""

    def __init__(self) -> None:
        self._owned_workspaces: set[Path] = set()

    def _workspace(self, prefix: str) -> Path:
        work = Path(tempfile.mkdtemp(prefix=prefix)).resolve()
        self._owned_workspaces.add(work)
        return work

    def cleanup(self, artifact: str) -> None:
        work = Path(artifact).absolute().parent
        if work in self._owned_workspaces:
            shutil.rmtree(work)
            self._owned_workspaces.discard(work)


def cleanup_artifacts(sandbox, artifacts: list[str]) -> None:
    # Third-party and test sandboxes need not implement the optional hook.
    cleanup = getattr(sandbox, "cleanup", None)
    if callable(cleanup):
        first_error = None
        for artifact in artifacts:
            try:
                cleanup(artifact)
            except Exception as exc:
                first_error = first_error or exc
        if first_error is not None:
            raise first_error
