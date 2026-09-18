"""Competition benchmark runner. Regenerates experiments/runs/competition/.

python scripts/competition_benchmark.py

Same dataset + seed for full and all ablations. Does not invent metrics.
LLM-as-judge is NOT RUN when DEEPSEEK_API_KEY is unset.
"""

from __future__ import annotations

import csv
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
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
sys.path[:0] = [str(ROOT / "packages" / name) for name in PACKAGES] + [str(ROOT / "services" / "api")]

from veriflow_ir.workflow import WorkflowIR
from veriflow_mutate.ir_faults import FAULTS, InvalidMutation, mutate_ir
from veriflow_repair.loop import verify_repair_loop
from veriflow_runtime.mock_exec import mock_execute
from veriflow_runtime.monitor import monitor_trace
from veriflow_spec.compiler import compile_spec
from veriflow_verify.result import verify_workflow

SEED = 20260919
OUT = ROOT / "experiments" / "runs" / "competition"
PROMPT_VERSION = "competition-llm-judge-v1"

BASES = [
    ("valid_lis", ROOT / "examples/compose/valid_lis.json", None),
    ("commit_a", ROOT / "examples/ci/commit_a.json", None),
    ("case4_runtime", ROOT / "examples/golden/case4_runtime_ir.json", ROOT / "examples/golden/case4_runtime.json"),
]

CATEGORY = {
    "orphan_node": "structural",
    "broken_edge": "structural",
    "missing_required_action": "semantic",
    "wrong_order": "ordering",
    "missing_branch": "branch",
    "broken_binding": "dataflow",
    "wrong_parameter": "parameter",
    "hardcoded_secret": "safety",
    "unsafe_webhook": "safety",
    "runtime_skip": "runtime",
}

REQUIRED_CATEGORIES = (
    "structural",
    "semantic",
    "ordering",
    "branch",
    "dataflow",
    "parameter",
    "safety",
    "runtime",
)

ABLATIONS = {
    "structure-only": {"structural"},
    "no-safety": {"structural", "semantic", "dataflow", "executable"},
    "no-runtime": None,  # full static, no monitor
    "full": None,  # static + runtime where applicable
}


def _load_ir(path: Path) -> WorkflowIR:
    return WorkflowIR.model_validate_json(path.read_text(encoding="utf-8"))


def _detected(result, expected: str) -> bool:
    aliases = {
        "WEAK_BOUNDS": {"WEAK_BOUNDS", "MISSING_REQUIRED_ACTION"},
        "ORDER_VIOLATION": {"ORDER_VIOLATION", "MISSING_HUMAN_GATE"},
        "BROKEN_BINDING": {"BROKEN_BINDING", "ORDER_VIOLATION", "DEAD_NODE"},
        "RUNTIME_FAIL": {"RUNTIME_FAIL"},
    }
    allowed = {expected, *aliases.get(expected, set())}
    codes = [issue.code for issue in result.issues]
    if expected == "RUNTIME_FAIL":
        return False  # runtime handled separately
    return any(code in allowed for code in codes)


def _runtime_fail(ir: WorkflowIR, spec, skip_after: str | None) -> tuple[bool, float]:
    started = time.perf_counter()
    trace = mock_execute(ir, skip_after=skip_after)
    monitor = monitor_trace(trace, spec)
    elapsed = (time.perf_counter() - started) * 1000
    failed = monitor.status == "FAIL" or any(item.status == "FAIL" for item in monitor.issues)
    return failed, elapsed


def build_cases() -> list[dict]:
    cases: list[dict] = []
    for gold_id, path, meta_path in BASES:
        ir = _load_ir(path)
        spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。", ir.domain)
        skip_after = None
        if meta_path and meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            skip_after = meta.get("skip_after")
        cases.append(
            {
                "gold": gold_id,
                "fault": "clean",
                "category": "clean",
                "expected": "PASS",
                "ir": ir,
                "spec": spec,
                "skip_after": None,
                "expected_runtime_fail": False,
            }
        )
        for fault in FAULTS:
            try:
                mutated = mutate_ir(ir, fault)
            except InvalidMutation:
                continue
            cases.append(
                {
                    "gold": gold_id,
                    "fault": fault,
                    "category": CATEGORY[fault],
                    "expected": mutated.expected_detection,
                    "ir": mutated.ir,
                    "spec": spec,
                    "skip_after": None,
                    "expected_runtime_fail": False,
                    "target_node": mutated.target_node,
                    "target_edge": mutated.target_edge,
                    "fault_location": mutated.fault_location,
                }
            )
        if skip_after:
            cases.append(
                {
                    "gold": gold_id,
                    "fault": "runtime_skip",
                    "category": "runtime",
                    "expected": "RUNTIME_FAIL",
                    "ir": ir,
                    "spec": spec,
                    "skip_after": skip_after,
                    "expected_runtime_fail": True,
                    "target_node": skip_after,
                    "target_edge": "",
                    "fault_location": skip_after,
                }
            )
    return cases


def evaluate_case(case: dict, mode: str) -> dict:
    dimensions = ABLATIONS[mode]
    started = time.perf_counter()
    if mode == "structure-only":
        result = verify_workflow(case["ir"], case["spec"], dimensions={"structural"})
        runtime_failed = False
        runtime_ms = None
    elif mode == "no-safety":
        result = verify_workflow(case["ir"], case["spec"], dimensions={"structural", "semantic", "dataflow", "executable"})
        runtime_failed = False
        runtime_ms = None
    elif mode == "no-runtime":
        result = verify_workflow(case["ir"], case["spec"])
        runtime_failed = False
        runtime_ms = None
    else:
        result = verify_workflow(case["ir"], case["spec"])
        runtime_failed, runtime_ms = _runtime_fail(case["ir"], case["spec"], case.get("skip_after"))
    static_ms = (time.perf_counter() - started) * 1000
    if case["expected"] == "RUNTIME_FAIL":
        detected = bool(runtime_failed) if mode == "full" else False
    elif case["fault"] == "clean":
        detected = result.status != "PASS" or any(i.severity in {"HIGH", "CRITICAL"} for i in result.issues)
    else:
        detected = _detected(result, case["expected"])
        if mode == "full" and case.get("expected_runtime_fail"):
            detected = detected or runtime_failed
    row = {
        "gold": case["gold"],
        "fault": case["fault"],
        "category": case["category"],
        "expected": case["expected"],
        "detected": detected,
        "codes": [issue.code for issue in result.issues],
        "static_status": result.status,
        "runtime_failed": runtime_failed,
        "static_ms": round(static_ms, 3),
        "runtime_ms": None if runtime_ms is None else round(runtime_ms, 3),
        "mode": mode,
    }
    if case["fault"] != "clean":
        loc = any(
            case.get("target_node") in issue.affected_nodes
            or case.get("fault_location") in issue.affected_nodes
            or case.get("fault_location") in issue.witness_path
            or (case.get("target_edge") and case.get("target_edge") in issue.affected_edges)
            for issue in result.issues
        )
        if case["expected"] == "RUNTIME_FAIL":
            loc = runtime_failed
        row["localized"] = loc
    else:
        row["localized"] = False
    return row


def summarize(rows: list[dict], mode: str) -> dict:
    clean = [r for r in rows if r["fault"] == "clean"]
    faults = [r for r in rows if r["fault"] != "clean"]
    tp = sum(1 for r in faults if r["detected"])
    fn = sum(1 for r in faults if not r["detected"])
    fp = sum(1 for r in clean if r["detected"])
    tn = sum(1 for r in clean if not r["detected"])
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    loc = [r for r in faults if r.get("localized")]
    return {
        "mode": mode,
        "n_clean": len(clean),
        "n_faulty": len(faults),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "detection_precision": precision,
        "detection_recall": recall,
        "detection_f1": f1,
        "false_positive_rate": fp / (fp + tn) if (fp + tn) else 0.0,
        "fault_localization_accuracy": (len(loc) / len(faults)) if faults else None,
        "average_static_ms": round(sum(r["static_ms"] for r in rows) / len(rows), 3) if rows else None,
    }


def llm_judge(cases: list[dict]) -> dict:
    from veriflow_api.llm import complete

    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    if not key:
        return {
            "status": "NOT RUN",
            "reason": "DEEPSEEK_API_KEY unset",
            "provider": "deepseek",
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "repeats": 0,
            "cases": [],
        }
    sample = [c for c in cases if c["fault"] != "clean"][:6] + [c for c in cases if c["fault"] == "clean"][:2]
    records = []
    for case in sample:
        payload = case["ir"].model_dump(mode="json")
        started = time.perf_counter()
        result = complete(
            [
                {
                    "role": "system",
                    "content": "You are an LLM-as-judge baseline, not VeriFlow Gate. Reply JSON {status: PASS|FAIL, category, location}.",
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {"requirement": "完整出题流程", "fault_hint": case["fault"], "workflow": payload},
                        ensure_ascii=False,
                    )[:8000],
                },
            ],
            temperature=0.0,
        )
        parsed = None
        parse_fail = False
        if result.error:
            status = "FAIL"
            parse_fail = True
        else:
            try:
                parsed = json.loads(result.text)
                status = str(parsed.get("status") or "").upper()
                if status not in {"PASS", "FAIL"}:
                    parse_fail = True
                    status = "FAIL"
            except json.JSONDecodeError:
                parse_fail = True
                status = "FAIL"
        records.append(
            {
                "gold": case["gold"],
                "fault": case["fault"],
                "expected": "PASS" if case["fault"] == "clean" else "FAIL",
                "llm_status": status,
                "parse_failure": parse_fail,
                "latency_ms": result.latency_ms or round((time.perf_counter() - started) * 1000, 3),
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "error": result.error,
            }
        )
    return {
        "status": "PASS",
        "provider": "deepseek",
        "model": model,
        "temperature": 0.0,
        "prompt_version": PROMPT_VERSION,
        "repeats": 1,
        "cases": records,
        "note": "LLM-as-judge baseline only. Never used as Gate.",
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cases = build_cases()
    cats = {c["category"] for c in cases if c["fault"] != "clean"}
    missing = [c for c in REQUIRED_CATEGORIES if c not in cats]
    if missing:
        raise SystemExit(f"competition suite missing categories: {missing}")

    ablation = {}
    full_rows = []
    for mode in ("structure-only", "no-safety", "no-runtime", "full"):
        rows = [evaluate_case(case, mode) for case in cases]
        ablation[mode] = {"metrics": summarize(rows, mode), "cases": [{k: v for k, v in row.items() if k != "ir"} for row in rows]}
        if mode == "full":
            full_rows = rows

    repair_ok = 0
    repair_n = 0
    patch_ops = []
    changed = []
    regressions = []
    for case in cases:
        if case["fault"] == "clean":
            continue
        repair_n += 1
        report = verify_repair_loop(case["ir"], case["spec"], max_iterations=2)
        if report.final.status == "PASS":
            repair_ok += 1
        patch_ops.append(report.patch_operations)
        changed.append(report.changed_nodes)
        regressions.append(report.regression_rate)

    llm = llm_judge(cases)
    full_metrics = ablation["full"]["metrics"]
    bases = [item[0] for item in BASES]
    n_clean = sum(1 for c in cases if c["fault"] == "clean")
    n_faulty = sum(1 for c in cases if c["fault"] != "clean")
    metrics = {
        **full_metrics,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "suite": "competition",
        "seed": SEED,
        "dataset": "competition-v1",
        "command": "python scripts/competition_benchmark.py",
        "base_workflows": bases,
        "base_workflow_count": len(bases),
        "n_clean": n_clean,
        "n_faulty": n_faulty,
        "n": n_faulty,
        "total": n_clean + n_faulty,
        "categories": sorted(cats),
        "category_counts": dict(Counter(c["category"] for c in cases if c["fault"] != "clean")),
        "repair_success_rate": repair_ok / repair_n if repair_n else None,
        "repair_regression_rate": (sum(regressions) / len(regressions)) if regressions else None,
        "average_patch_operations": (sum(patch_ops) / len(patch_ops)) if patch_ops else None,
        "average_changed_nodes": (sum(changed) / len(changed)) if changed else None,
        "incremental_verification_latency": "N/A",
        "full_verification_latency_ms": full_metrics.get("average_static_ms"),
        "speedup": "N/A",
        "incremental_full_disagreement_count": "N/A",
        "llm_judge_baseline": llm["status"],
        "note": "Measured by scripts/competition_benchmark.py. Not a public leaderboard. Not SOTA.",
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "ablation.json").write_text(
        json.dumps({k: v["metrics"] for k, v in ablation.items()}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    slim = [{k: v for k, v in row.items()} for row in full_rows]
    (OUT / "cases.json").write_text(json.dumps(slim, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (OUT / "cases.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["gold", "fault", "category", "expected", "detected", "localized", "codes"],
            extrasaction="ignore",
        )
        writer.writeheader()
        for row in slim:
            writer.writerow({**row, "codes": "|".join(row.get("codes") or [])})
    (OUT / "llm_judge.json").write_text(json.dumps(llm, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    readme = "\n".join(
        [
            "# Competition benchmark",
            "",
            "Re-run (deleting this directory first is expected):",
            "",
            "```",
            "python scripts/competition_benchmark.py",
            "```",
            "",
            f"- seed: `{SEED}`",
            f"- dataset: `{metrics['dataset']}`",
            f"- base_workflows: {metrics['base_workflow_count']} ({', '.join(bases)})",
            f"- clean: {n_clean}",
            f"- faulty: {n_faulty}",
            f"- total: {n_clean + n_faulty}",
            f"- categories: {', '.join(metrics['categories'])}",
            f"- full F1: {full_metrics['detection_f1']:.3f}",
            f"- LLM-as-judge: {llm['status']}" + (f" ({llm.get('reason')})" if llm.get("reason") else ""),
            "",
            "Ablations use the same cases and seed. structure-only / no-safety / no-runtime / full.",
            "Numbers are measured. This is not a published leaderboard.",
            "",
        ]
    )
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    print(readme)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
