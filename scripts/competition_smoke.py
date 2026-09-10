"""Competition smoke: unit tests + golden verify/repair + small bench + tsc."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str]) -> int:
    print("==", " ".join(cmd))
    return subprocess.call(cmd, cwd=ROOT)


def main() -> int:
    failures: list[str] = []
    if run([sys.executable, "-m", "pytest", "-q"]) != 0:
        failures.append("pytest")
    env = dict(**{**{k: v for k, v in __import__("os").environ.items()}})
    env["PYTHONPATH"] = __import__("os").pathsep.join(
        [
            *(str(ROOT / "packages" / name) for name in ("ir", "staticcheck", "compare", "sandbox", "mutate", "spec", "verify", "repair", "explain", "cli")),
            str(ROOT / "services" / "api"),
        ]
    )
    demo = subprocess.call(
        [
            sys.executable,
            "-m",
            "veriflow_cli",
            "verify-repair",
            "--workflow",
            "examples/compose/missing_gate.json",
            "--nl",
            "完整出题。",
            "--max-iterations",
            "3",
        ],
        cwd=ROOT,
        env=env,
    )
    if demo != 0:
        failures.append("verify-repair demo")
    bench = subprocess.call(
        [
            sys.executable,
            "-m",
            "veriflow_cli",
            "bench",
            "--workflow",
            "examples/compose/valid_lis.json",
            "--out",
            "experiments/runs/smoke",
        ],
        cwd=ROOT,
        env=env,
    )
    if bench != 0:
        failures.append("bench")
    tsc = ROOT / "apps" / "web" / "node_modules" / ".bin" / "tsc"
    if tsc.exists() and subprocess.call([str(tsc), "--noEmit"], cwd=ROOT / "apps" / "web") != 0:
        failures.append("tsc")
    report = ROOT / "artifacts" / "smoke.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"failures": failures}, indent=2), encoding="utf-8")
    print("COMPETITION SMOKE TEST", "FAIL" if failures else "PASS")
    if failures:
        print(failures)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
