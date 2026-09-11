"""Competition smoke 2.0: unit + golden + runtime + incremental + gate + small bench + tsc."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = (
    "ir",
    "staticcheck",
    "compare",
    "sandbox",
    "mutate",
    "spec",
    "verify",
    "repair",
    "explain",
    "cli",
    "runtime",
)


def _env() -> dict[str, str]:
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join(
        [*(str(ROOT / "packages" / name) for name in PACKAGES), str(ROOT / "services" / "api")]
    )
    return env


def run(cmd: list[str], env: dict[str, str] | None = None) -> int:
    print("==", " ".join(cmd))
    return subprocess.call(cmd, cwd=ROOT, env=env or os.environ.copy())


def main() -> int:
    env = _env()
    sections = {
        "Core Algorithm": "PASS",
        "E2E": "PASS",
        "Frontend": "PASS",
        "Benchmark": "PASS",
        "Runtime": "PASS",
        "CI Gate": "PASS",
    }
    notes: list[str] = []

    if run([sys.executable, "-m", "pytest", "-q"], env) != 0:
        sections["Core Algorithm"] = "FAIL"

    demo = run(
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
        env,
    )
    if demo != 0:
        sections["E2E"] = "FAIL"

    case4 = subprocess.run(
        [
            sys.executable,
            "-m",
            "veriflow_cli",
            "runtime",
            "--workflow",
            "examples/golden/case4_runtime_ir.json",
            "--nl",
            "完整出题：生成器、范围守卫、审题门、入库。当 payment_status == success 时发送通知。",
            "--skip-after",
            "if_pay",
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    if case4.returncode != 0 or "STATIC PASS + RUNTIME FAIL" not in case4.stdout:
        sections["Runtime"] = "FAIL"
        notes.append("CASE 4 runtime mismatch")

    inc = run(
        [
            sys.executable,
            "-m",
            "veriflow_cli",
            "incremental",
            "--before",
            "examples/ci/commit_a.json",
            "--after",
            "examples/ci/commit_b.json",
            "--nl",
            "完整出题。",
        ],
        env,
    )
    if inc != 0:
        sections["Runtime"] = "FAIL"

    gold_gate = subprocess.run(
        [
            sys.executable,
            "-m",
            "veriflow_cli",
            "gate",
            "--workflow",
            "examples/ci/commit_a.json",
            "--nl",
            "完整出题：生成器、范围守卫、审题门、入库。",
            "--policy",
            "examples/veriflow-policy.yaml",
        ],
        cwd=ROOT,
        env=env,
    )
    broken_gate = subprocess.run(
        [
            sys.executable,
            "-m",
            "veriflow_cli",
            "gate",
            "--workflow",
            "examples/ci/commit_b.json",
            "--nl",
            "完整出题：生成器、范围守卫、审题门、入库。",
            "--policy",
            "examples/veriflow-policy.yaml",
        ],
        cwd=ROOT,
        env=env,
    )
    if gold_gate.returncode != 0 or broken_gate.returncode != 1:
        sections["CI Gate"] = "FAIL"
        notes.append(f"gate exit gold={gold_gate.returncode} broken={broken_gate.returncode}")

    n8n = os.environ.get("N8N_BASE_URL") and os.environ.get("N8N_API_KEY")
    if not n8n:
        notes.append("n8n live: SKIPPED WITH REASON (OPTIONAL INTEGRATION, no N8N_BASE_URL/N8N_API_KEY)")

    bench = run(
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
        env,
    )
    if bench != 0:
        sections["Benchmark"] = "FAIL"

    web = ROOT / "apps" / "web"
    tsc_cmd = web / "node_modules" / ".bin" / "tsc.cmd"
    tsc_js = web / "node_modules" / "typescript" / "bin" / "tsc"
    tsc = web / "node_modules" / ".bin" / "tsc"
    tsc_status = 1
    if tsc_cmd.exists():
        tsc_status = subprocess.call([str(tsc_cmd), "--noEmit"], cwd=web)
    elif tsc_js.exists():
        tsc_status = subprocess.call(["node", str(tsc_js), "--noEmit"], cwd=web)
    elif tsc.exists():
        tsc_status = subprocess.call([str(tsc), "--noEmit"], cwd=web)
    else:
        notes.append("tsc missing")
    if tsc_status != 0:
        sections["Frontend"] = "FAIL"

    report = {
        "COMPETITION_READINESS": sections,
        "notes": notes,
        "failures": [name for name, status in sections.items() if status == "FAIL"],
    }
    path = ROOT / "artifacts" / "smoke.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("COMPETITION READINESS")
    for name, status in sections.items():
        print(f"  {name}: {status}")
    for note in notes:
        print(" ", note)
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
