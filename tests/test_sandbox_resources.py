import subprocess
import sys
import threading
from pathlib import Path

import pytest

from veriflow_sandbox import docker
from veriflow_sandbox.judge import Case, judge_submission
from veriflow_sandbox.process import ProcessSandbox
from veriflow_sandbox.stress import StressProgram, run_stress


@pytest.mark.parametrize("cases", [[], [Case("", "", "typo")], [Case("", "", "public"), Case("", "", "typo")]])
def test_judge_rejects_missing_or_unknown_tests_before_compile(cases):
    class NeverCompile:
        name = "mock"

        def compile(self, *args):
            pytest.fail("invalid tests must not compile")

    result = judge_submission(NeverCompile(), "python3", "", cases, 100, 64)
    assert (result.verdict, result.stage, result.detail) == ("SYSTEM_ERROR", "validation", "missing_tests")


def test_docker_compile_and_run_have_resource_and_security_limits(monkeypatch):
    calls = []

    def fake(args, timeout, stdin=None):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(docker, "_docker", fake)
    box = docker.DockerSandbox()
    compiled = box.compile("python3", "print(1)")
    try:
        box.run("python3", compiled.artifact, "", 100, 8192)
        for args in calls:
            if args[0] != "run":
                continue
            assert "--cpus=1" in args
            assert "--pids-limit=64" in args
            assert "--cap-drop=ALL" in args
            assert "--security-opt=no-new-privileges" in args
            assert "--user=65534:65534" in args
            assert "--read-only" in args
            assert "--name" in args
            assert "--memory=512m" in args
            assert "--memory-swap=512m" in args
    finally:
        if hasattr(box, "cleanup"):
            box.cleanup(compiled.artifact)


@pytest.mark.parametrize("failure", [subprocess.TimeoutExpired("docker", 1), OSError("docker down")])
def test_named_docker_container_is_removed_after_failure(monkeypatch, failure):
    calls = []

    def fake(args, timeout, stdin=None):
        calls.append(args)
        if args[0] == "run":
            raise failure
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(docker, "_docker", fake)
    try:
        docker.DockerSandbox().run("python3", "main.py", "", 100, 64)
    except RuntimeError:
        pass
    assert calls[0][0] == "run"
    assert calls[-1][:2] == ["rm", "-f"]
    assert calls[-1][2] == calls[0][calls[0].index("--name") + 1]


@pytest.mark.parametrize("stream", ["stdout", "stderr"])
def test_process_output_is_bounded_while_running(monkeypatch, stream):
    import veriflow_sandbox.process as process

    monkeypatch.setattr(process, "OUTPUT_LIMIT", 4096)
    box = ProcessSandbox()
    compiled = box.compile("python3", f"import sys,time\nsys.{stream}.write('x'*32768)\nsys.{stream}.flush()\ntime.sleep(5)\n")
    try:
        result = box.run("python3", compiled.artifact, "", 2000, 64)
        assert result.verdict == "RE"
        assert result.detail == "output_limit"
        assert len(result.stdout.encode()) + len(result.stderr.encode()) <= 4096
        assert result.time_ms < 1500
    finally:
        if hasattr(box, "cleanup"):
            box.cleanup(compiled.artifact)


@pytest.mark.parametrize("operation", ["judge", "stress"])
def test_owned_compile_directories_removed_after_job(operation):
    class TrackingBox(ProcessSandbox):
        def compile(self, *args):
            result = super().compile(*args)
            if result.artifact:
                paths.append(Path(result.artifact).parent)
            return result

    paths = []
    box = TrackingBox()
    if operation == "judge":
        judge_submission(box, "python3", "print(1)", [Case("", "1", "public")], 1000, 64)
    else:
        run_stress(box, *(StressProgram("python3", "print(1)", role) for role in ("gen", "brute", "sol")), 1, 1000, 64)
    assert paths
    assert all(not path.exists() for path in paths)


def test_cleanup_only_removes_owned_compile_directories(tmp_path):
    box = ProcessSandbox()
    unrelated = tmp_path / "main.py"
    unrelated.write_text("keep", encoding="utf-8")
    box.cleanup(str(unrelated))
    assert unrelated.read_text(encoding="utf-8") == "keep"


def test_docker_concurrency_wait_is_bounded(monkeypatch):
    from veriflow_sandbox.types import SandboxError

    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(docker, "_DOCKER_SLOTS", slots)
    monkeypatch.setattr(docker, "SLOT_WAIT_SECONDS", 0.01)
    with pytest.raises(SandboxError, match="sandbox_busy"):
        docker.DockerSandbox().compile("python3", "print(1)")


def test_streaming_runner_preserves_utf8_and_stdin():
    from veriflow_sandbox.resources import run_bounded

    result = run_bounded([sys.executable, "-c", "import sys; sys.stdout.buffer.write(sys.stdin.buffer.read()); sys.stderr.buffer.write('错误'.encode())"], timeout=2, stdin="中文", output_limit=4096)
    assert (result.stdout, result.stderr) == ("中文", "错误")


def test_docker_run_five_second_timeout_still_reports_tle(monkeypatch):
    def fake(args, timeout, stdin=None):
        if args[0] == "run":
            raise subprocess.TimeoutExpired("docker", timeout)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(docker, "_docker", fake)
    result = docker.DockerSandbox().run("python3", "main.py", "", 4000, 64)
    assert result.verdict == "TLE"


@pytest.mark.parametrize("operation", ["compile_failure", "runtime_failure", "stress_compile_failure"])
def test_artifacts_cleaned_on_early_failure(operation):
    paths = []

    class TrackingBox(ProcessSandbox):
        def _workspace(self, prefix):
            work = super()._workspace(prefix)
            paths.append(work)
            return work

        def run(self, *args):
            raise OSError("runner unavailable")

    box = TrackingBox()
    if operation == "compile_failure":
        assert not box.compile("python3", "def (\n").ok
    elif operation == "runtime_failure":
        with pytest.raises(OSError):
            judge_submission(box, "python3", "print(1)", [Case("", "1", "public")], 1000, 64)
    else:
        result = run_stress(box, StressProgram("python3", "print(1)", "gen"), StressProgram("python3", "def (\n", "brute"), StressProgram("python3", "print(1)", "sol"), 1, 1000, 64)
        assert result.status == "stress_error"
    assert paths and all(not path.exists() for path in paths)


def test_docker_compile_timeout_cleans_workdir_and_releases_slot(monkeypatch):
    paths = []

    class TrackingBox(docker.DockerSandbox):
        def _workspace(self, prefix):
            work = super()._workspace(prefix)
            paths.append(work)
            return work

    def fake(args, timeout, stdin=None):
        if args[0] == "run":
            raise subprocess.TimeoutExpired("docker", timeout)
        return subprocess.CompletedProcess(args, 0, "", "")

    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(docker, "_DOCKER_SLOTS", slots)
    monkeypatch.setattr(docker, "_docker", fake)
    result = TrackingBox().compile("python3", "print(1)")
    assert not result.ok and result.log == "compile timeout"
    assert paths and all(not path.exists() for path in paths)
    assert slots.acquire(blocking=False)
    slots.release()


def test_cleanup_failure_is_infrastructure_error(monkeypatch):
    from veriflow_sandbox.types import SandboxError

    def fake(args, timeout, stdin=None):
        if args[0] == "rm":
            raise subprocess.TimeoutExpired("docker", timeout)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(docker, "_docker", fake)
    with pytest.raises(SandboxError, match="sandbox_cleanup_failed"):
        docker.DockerSandbox().run("python3", "main.py", "", 100, 64)


def test_docker_python_validation_does_not_leave_container_owned_cache(monkeypatch):
    def fake(args, timeout, stdin=None):
        if args[0] == "rm":
            return subprocess.CompletedProcess(args, 0, "", "")
        work = args[args.index("-v") + 1].removesuffix(":/work")
        inner = args[args.index(docker.IMAGE) + 1:]
        # Run only the known safe validation command locally, not submitted code.
        result = subprocess.run([sys.executable, *inner[1:]], cwd=work, capture_output=True, text=True, timeout=2)
        assert not (Path(work) / "__pycache__").exists()
        return result

    monkeypatch.setattr(docker, "_docker", fake)
    box = docker.DockerSandbox()
    result = box.compile("python3", "raise RuntimeError('must not execute')")
    try:
        assert result.ok
    finally:
        if result.artifact:
            box.cleanup(result.artifact)
