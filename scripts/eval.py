"""Reproducible contrast numbers for the contest test report."""

from __future__ import annotations

import json
from pathlib import Path

from veriflow_api.compiler import fallback_compile
from veriflow_api.compose_attack import attack_compose
from veriflow_mutate.kill import kill_rate
from veriflow_sandbox.judge import Case, judge_submission
from veriflow_sandbox.process import ProcessSandbox
from veriflow_staticcheck.check import check_workflow

ROOT = Path(__file__).resolve().parents[1]


def vf1001_tests() -> list[Case]:
    cases: list[Case] = []
    for visibility in ("public", "hidden"):
        folder = ROOT / "examples/problems/VF1001/tests" / visibility
        for path in sorted(folder.glob("*.in")):
            cases.append(
                Case(
                    stdin=path.read_text(encoding="utf-8"),
                    stdout=path.with_suffix(".out").read_text(encoding="utf-8"),
                    visibility=visibility,
                    name=path.stem,
                )
            )
    return cases


def main() -> None:
    sandbox = ProcessSandbox()
    tests = vf1001_tests()
    public = [case for case in tests if case.visibility == "public"]
    wrong = "n=int(input())\nprint(n)\n"
    sample = judge_submission(sandbox, "python3", wrong, public, 1000, 256)
    full = judge_submission(sandbox, "python3", wrong, tests, 1000, 256)
    ref = (ROOT / "examples/problems/VF1001/ref.py").read_text(encoding="utf-8")
    mutate = kill_rate(ref, [(c.stdin, c.stdout) for c in tests])
    inject = {
        "missing_gate": "MISSING_HUMAN_GATE" in {e.code for e in check_workflow(fallback_compile("不要审题门，直接入库"))},
        "weak_bounds": any(
            item["tag"] == "weak_bounds"
            for item in attack_compose(fallback_compile("不要写数据范围守卫"))
        ),
    }
    report = {
        "sample_only_verdict": sample.verdict,
        "full_verdict": full.verdict,
        "full_counterexample_source": (full.counterexample or {}).get("source"),
        "vf1001_kill_rate": mutate["kill_rate"],
        "vf1001_mutants_killed": f"{mutate['killed']}/{mutate['total']}",
        "compose_injected_recall": inject,
    }
    out = ROOT / "artifacts" / "eval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
