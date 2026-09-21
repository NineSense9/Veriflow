from __future__ import annotations

import json
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

    def stress(
        self,
        generator: StressProgram,
        brute: StressProgram,
        solution: StressProgram,
        rounds: int,
        time_limit_ms: int,
        memory_limit_mb: int,
    ) -> StressResult:
        from veriflow_sandbox.stress import StressResult
        work = self._workspace("vf-docker-stress-")
        started = time.perf_counter()
        try:
            work.chmod(0o777)
            # Write sources
            progs = [("gen", generator), ("brute", brute), ("sol", solution)]
            cfg_tasks = []
            for role, prog in progs:
                filename = f"{role}.py" if prog.lang == "python3" else f"{role}.cpp"
                src_path = work / filename
                src_path.write_text(prog.source, encoding="utf-8")
                src_path.chmod(0o644)
                cfg_tasks.append({"role": role, "lang": prog.lang})

            compile_cfg_path = work / "_compile_cfg.json"
            compile_cfg_path.write_text(json.dumps(cfg_tasks), encoding="utf-8")
            compile_cfg_path.chmod(0o644)

            compile_py = (
                "import json, sys, subprocess\n"
                "from pathlib import Path\n"
                "tasks = json.loads(Path('_compile_cfg.json').read_text(encoding='utf-8'))\n"
                "for item in tasks:\n"
                "    role = item['role']\n"
                "    lang = item['lang']\n"
                "    if lang == 'python3':\n"
                "        try:\n"
                "            compile(Path(f'{role}.py').read_bytes(), f'{role}.py', 'exec')\n"
                "        except Exception as exc:\n"
                "            print(json.dumps({'ok': False, 'role': role, 'log': str(exc)}))\n"
                "            sys.exit(0)\n"
                "    elif lang == 'cpp17':\n"
                "        res = subprocess.run(['g++', '-std=c++17', '-O2', '-o', role, f'{role}.cpp'], capture_output=True, text=True)\n"
                "        if res.returncode != 0:\n"
                "            print(json.dumps({'ok': False, 'role': role, 'log': res.stderr or res.stdout}))\n"
                "            sys.exit(0)\n"
                "print(json.dumps({'ok': True}))\n"
            )
            compile_script_path = work / "_compile.py"
            compile_script_path.write_text(compile_py, encoding="utf-8")
            compile_script_path.chmod(0o755)

            try:
                comp_res = _container(work, ["python3", "_compile.py"], timeout=30, memory_mb=512, writable=True)
            except subprocess.TimeoutExpired:
                return StressResult(
                    status="stress_error",
                    rounds_ran=0,
                    time_ms=_elapsed(started),
                    sandbox=self.name,
                    compile_log="compile timeout",
                    detail="compile_timeout",
                )
            except OutputLimitExceeded:
                return StressResult(
                    status="stress_error",
                    rounds_ran=0,
                    time_ms=_elapsed(started),
                    sandbox=self.name,
                    compile_log="compile output limit",
                    detail="compile_output_limit",
                )

            try:
                comp_data = json.loads(comp_res.stdout.strip()) if comp_res.stdout.strip() else {}
            except json.JSONDecodeError:
                comp_data = {"ok": False, "role": "sol", "log": comp_res.stderr or comp_res.stdout}

            if not comp_data.get("ok"):
                failed_role = comp_data.get("role", "sol")
                status = "CE" if failed_role == "sol" else "stress_error"
                return StressResult(
                    status=status,
                    rounds_ran=0,
                    time_ms=_elapsed(started),
                    sandbox=self.name,
                    compile_log=comp_data.get("log", comp_res.stderr),
                    detail=f"{failed_role}_compile",
                    failed_role=failed_role,
                )

            # Write stress runner
            runner_cfg = {
                "rounds": rounds,
                "time_limit_ms": time_limit_ms,
                "gen_cmd": ["./gen"] if generator.lang == "cpp17" else ["python3", "gen.py"],
                "brute_cmd": ["./brute"] if brute.lang == "cpp17" else ["python3", "brute.py"],
                "sol_cmd": ["./sol"] if solution.lang == "cpp17" else ["python3", "sol.py"],
            }
            runner_cfg_path = work / "_runner_cfg.json"
            runner_cfg_path.write_text(json.dumps(runner_cfg), encoding="utf-8")
            runner_cfg_path.chmod(0o644)

            runner_py = (
                "import json, os, signal, subprocess, sys, time\n"
                "from pathlib import Path\n"
                "\n"
                "def tokenize(text):\n"
                "    n = text.replace('\\r\\n', '\\n').replace('\\r', '\\n').strip()\n"
                "    return n.split() if n else []\n"
                "\n"
                "def outputs_equal(a, b):\n"
                "    return tokenize(a) == tokenize(b)\n"
                "\n"
                "def run_proc(cmd, stdin_data, timeout_sec, env=None):\n"
                "    t0 = time.perf_counter()\n"
                "    preexec = os.setsid if hasattr(os, 'setsid') else None\n"
                "    try:\n"
                "        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, preexec_fn=preexec)\n"
                "        try:\n"
                "            stdout, stderr = p.communicate(input=stdin_data, timeout=timeout_sec)\n"
                "        except subprocess.TimeoutExpired:\n"
                "            if hasattr(os, 'killpg') and hasattr(os, 'getpgid'):\n"
                "                try: os.killpg(os.getpgid(p.pid), signal.SIGKILL)\n"
                "                except OSError: pass\n"
                "            else:\n"
                "                p.kill()\n"
                "            p.communicate()\n"
                "            elapsed = int((time.perf_counter() - t0) * 1000)\n"
                "            return {'verdict': 'TLE', 'stdout': '', 'stderr': '', 'time_ms': max(elapsed, int(timeout_sec * 1000))}\n"
                "        elapsed = int((time.perf_counter() - t0) * 1000)\n"
                "        out = stdout[:2 * 1024 * 1024]\n"
                "        err = stderr[:2 * 1024 * 1024]\n"
                "        if p.returncode in (137, -9):\n"
                "            return {'verdict': 'MLE', 'stdout': out, 'stderr': err, 'time_ms': elapsed}\n"
                "        if p.returncode != 0:\n"
                "            return {'verdict': 'RE', 'stdout': out, 'stderr': err, 'time_ms': elapsed}\n"
                "        return {'verdict': 'OK', 'stdout': out, 'stderr': err, 'time_ms': elapsed}\n"
                "    except Exception as exc:\n"
                "        elapsed = int((time.perf_counter() - t0) * 1000)\n"
                "        return {'verdict': 'RE', 'stdout': '', 'stderr': str(exc), 'time_ms': elapsed}\n"
                "\n"
                "cfg = json.loads(Path('_runner_cfg.json').read_text(encoding='utf-8'))\n"
                "rounds = cfg['rounds']\n"
                "tl_ms = cfg['time_limit_ms']\n"
                "gen_cmd = cfg['gen_cmd']\n"
                "brute_cmd = cfg['brute_cmd']\n"
                "sol_cmd = cfg['sol_cmd']\n"
                "total_time = 0\n"
                "log = []\n"
                "for idx in range(1, rounds + 1):\n"
                "    env = dict(os.environ, VF_SEED=str(idx))\n"
                "    res_gen = run_proc(gen_cmd, '', max(tl_ms / 1000.0, 0.05) + 1.0, env=env)\n"
                "    total_time += res_gen['time_ms']\n"
                "    if res_gen['verdict'] != 'OK':\n"
                "        print(json.dumps({'status': 'stress_error', 'rounds_ran': idx, 'time_ms': total_time, 'detail': f\"gen_{res_gen['verdict'].lower()}\", 'failed_role': 'gen', 'log': log + [{'round': idx, 'status': res_gen['verdict'], 'role': 'gen'}]}))\n"
                "        sys.exit(0)\n"
                "    res_brute = run_proc(brute_cmd, res_gen['stdout'], max(tl_ms / 1000.0, 0.05) + 1.0)\n"
                "    total_time += res_brute['time_ms']\n"
                "    if res_brute['verdict'] != 'OK':\n"
                "        print(json.dumps({'status': 'stress_error', 'rounds_ran': idx, 'time_ms': total_time, 'detail': f\"brute_{res_brute['verdict'].lower()}\", 'failed_role': 'brute', 'counterexample': {'stdin': res_gen['stdout'], 'expected': '', 'actual': res_brute['stdout'], 'source': 'stress', 'verdict': res_brute['verdict']}, 'log': log + [{'round': idx, 'status': res_brute['verdict'], 'role': 'brute'}]}))\n"
                "        sys.exit(0)\n"
                "    res_sol = run_proc(sol_cmd, res_gen['stdout'], max(tl_ms / 1000.0, 0.05))\n"
                "    total_time += res_sol['time_ms']\n"
                "    if res_sol['verdict'] != 'OK':\n"
                "        print(json.dumps({'status': res_sol['verdict'], 'rounds_ran': idx, 'time_ms': total_time, 'failed_role': 'sol', 'counterexample': {'stdin': res_gen['stdout'], 'expected': res_brute['stdout'], 'actual': res_sol['stdout'], 'source': 'stress', 'verdict': res_sol['verdict']}, 'log': log + [{'round': idx, 'status': res_sol['verdict'], 'role': 'sol'}]}))\n"
                "        sys.exit(0)\n"
                "    if not outputs_equal(res_sol['stdout'], res_brute['stdout']):\n"
                "        print(json.dumps({'status': 'mismatch', 'rounds_ran': idx, 'time_ms': total_time, 'failed_role': 'sol', 'counterexample': {'stdin': res_gen['stdout'], 'expected': res_brute['stdout'], 'actual': res_sol['stdout'], 'source': 'stress', 'verdict': 'WA'}, 'log': log + [{'round': idx, 'status': 'mismatch', 'role': 'sol'}]}))\n"
                "        sys.exit(0)\n"
                "    log.append({'round': idx, 'status': 'ok'})\n"
                "print(json.dumps({'status': 'no_fail', 'rounds_ran': rounds, 'time_ms': total_time, 'log': log}))\n"
                "sys.exit(0)\n"
            )
            runner_script_path = work / "_runner.py"
            runner_script_path.write_text(runner_py, encoding="utf-8")
            runner_script_path.chmod(0o755)

            stress_timeout = max(30.0, rounds * (time_limit_ms / 1000.0 + 0.1) + 5.0)
            completed = _container(
                work,
                ["python3", "_runner.py"],
                timeout=stress_timeout,
                memory_mb=max(64, min(memory_limit_mb, 512)),
                writable=False,
            )
            data = json.loads(completed.stdout.strip())
            return StressResult(
                status=data["status"],
                rounds_ran=data.get("rounds_ran", 0),
                time_ms=_elapsed(started),
                sandbox=self.name,
                counterexample=data.get("counterexample"),
                compile_log=data.get("compile_log"),
                detail=data.get("detail"),
                failed_role=data.get("failed_role"),
                log=data.get("log", []),
            )
        except subprocess.TimeoutExpired:
            return StressResult(
                status="TLE",
                rounds_ran=0,
                time_ms=_elapsed(started),
                sandbox=self.name,
                detail="stress_timeout",
            )
        except OutputLimitExceeded:
            return StressResult(
                status="RE",
                rounds_ran=0,
                time_ms=_elapsed(started),
                sandbox=self.name,
                detail="output_limit",
            )
        finally:
            self.cleanup(str(work / "_clean_dummy"))


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
