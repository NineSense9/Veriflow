"""Competition benchmark runner. Regenerates experiments/runs/competition/.

python scripts/competition_benchmark.py
python scripts/competition_benchmark.py --llm-repeats 3

Deterministic enumeration: every listed base × applicable mutation + explicit
runtime faults. SEED is recorded for provenance only; no sampling RNG is used.

LLM-as-judge is NOT RUN when DEEPSEEK_API_KEY is unset. It never participates
in Gate / repair acceptance / publish.
"""

from __future__ import annotations

import argparse
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
PROMPT_VERSION = "competition-llm-judge-v3-static"
MODES = ("structure-only", "no-safety", "no-runtime", "full")

ABLATION_CLOSES = {
    "structure-only": "Only structural static checks. No semantic/dataflow/safety/executable extras. No runtime monitor.",
    "no-safety": "Full static pipeline minus the safety dimension. Runtime monitor still runs.",
    "no-runtime": "Full static pipeline. Runtime monitor disabled.",
    "full": "Full static pipeline plus runtime monitor.",
}

STATIC_DIMENSIONS = {
    "structure-only": {"structural"},
    "no-safety": {"structural", "semantic", "dataflow", "executable"},
    "no-runtime": None,
    "full": None,
}

BASES = [
    {
        "id": "linear_compose",
        "path": ROOT / "examples/compose/valid_lis.json",
        "topology": "linear",
        "requirement": "完整出题：生成器、范围守卫、审题门、入库。",
    },
    {
        "id": "merge_dual",
        "path": ROOT / "examples/competition/merge_dual.json",
        "topology": "merge",
        "requirement": "完整出题：生成器与辅助变换汇合后经范围守卫、审题门、入库。",
    },
    {
        "id": "dataflow_typed",
        "path": ROOT / "examples/competition/dataflow_typed.json",
        "topology": "dataflow",
        "requirement": "完整出题：生成器产出测试对象，经变换与范围守卫、审题门后入库。",
    },
    {
        "id": "safety_env",
        "path": ROOT / "examples/competition/safety_env.json",
        "topology": "safety",
        "requirement": "完整出题：生成器、范围守卫、审题门、入库。密钥只用环境变量，外发地址只允许内网。",
    },
    {
        "id": "branch_notify",
        "path": ROOT / "examples/competition/branch_notify.json",
        "topology": "branch",
        "requirement": "完整出题：生成器、范围守卫、审题门、入库。当 payment_status == success 时发送通知。",
    },
]

RUNTIME_FAULTS = [
    {
        "gold": "branch_notify",
        "fault": "runtime_skip_after_branch",
        "skip_after": "if_pay",
        "take_true_branch": True,
        "expected_detection": "eventually notify",
        "diagnosis_needles": ("eventually notify",),
        "note": "EVENTUALLY notify + IF_BRANCH_THEN; trace stops after if_pay",
    },
    {
        "gold": "branch_notify",
        "fault": "runtime_false_branch_missing_notify",
        "skip_after": None,
        "take_true_branch": False,
        "expected_detection": "eventually notify",
        "diagnosis_needles": ("eventually notify",),
        "note": "false branch skips notify; EVENTUALLY notify fails",
    },
    {
        "gold": "branch_notify",
        "fault": "runtime_skip_after_notify",
        "skip_after": "notify_1",
        "take_true_branch": True,
        "expected_detection": "eventually publish_problem",
        "diagnosis_needles": ("eventually publish_problem", "exactly once publish_problem"),
        "note": "notify observed; EVENTUALLY/EXACTLY_ONCE publish fail",
    },
    {
        "gold": "linear_compose",
        "fault": "runtime_skip_after_review",
        "skip_after": "review",
        "take_true_branch": True,
        "expected_detection": "eventually publish_problem",
        "diagnosis_needles": ("eventually publish_problem", "exactly once publish_problem"),
        "note": "IF_EXECUTED_THEN / EVENTUALLY publish after review",
    },
    {
        "gold": "merge_dual",
        "fault": "runtime_skip_after_join",
        "skip_after": "join",
        "take_true_branch": True,
        "expected_detection": "eventually publish_problem",
        "diagnosis_needles": ("eventually publish_problem", "exactly once publish_problem"),
        "note": "merge completed; publish never observed",
    },
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

LLM_FORBIDDEN_KEYS = (
    "fault",
    "category",
    "expected",
    "expected_detection",
    "target_node",
    "target_edge",
    "mutation_operation",
    "fault_location",
    "fault_hint",
    "skip_after",
    "diagnosis_needles",
)


def _load_ir(path: Path) -> WorkflowIR:
    return WorkflowIR.model_validate_json(path.read_text(encoding="utf-8"))


def _anomaly(result, runtime_failed: bool) -> bool:
    if runtime_failed:
        return True
    if result.status != "PASS":
        return True
    return any(issue.severity in {"HIGH", "CRITICAL"} for issue in result.issues)


def _diagnosed_static(result, expected: str) -> bool:
    return any(issue.code == expected for issue in result.issues)


def _diagnosed_runtime(monitor, needles: tuple[str, ...]) -> bool:
    texts = []
    for item in monitor.issues:
        if item.status != "FAIL":
            continue
        texts.append(item.expected or "")
        texts.append(item.constraint_id or "")
        texts.append(item.observed or "")
    blob = " ".join(texts).lower()
    return any(needle.lower() in blob for needle in needles)


def _localized(result, case: dict, runtime_failed: bool, monitor) -> bool:
    if case.get("expected_runtime_fail"):
        if not runtime_failed:
            return False
        target = case.get("target_node") or case.get("skip_after") or ""
        if not target:
            return runtime_failed
        for item in monitor.issues:
            if item.status != "FAIL":
                continue
            if target in (item.affected_nodes or []):
                return True
            if target in (item.expected or "") or target in (item.observed or ""):
                return True
        return runtime_failed
    loc = any(
        case.get("target_node") in issue.affected_nodes
        or case.get("fault_location") in issue.affected_nodes
        or case.get("fault_location") in issue.witness_path
        or (case.get("target_edge") and case.get("target_edge") in issue.affected_edges)
        for issue in result.issues
    )
    return loc


def _runtime(ir: WorkflowIR, spec, skip_after: str | None, take_true_branch: bool):
    started = time.perf_counter()
    trace = mock_execute(ir, skip_after=skip_after, take_true_branch=take_true_branch)
    monitor = monitor_trace(trace, spec)
    elapsed = (time.perf_counter() - started) * 1000
    failed = monitor.status == "FAIL" or any(item.status == "FAIL" for item in monitor.issues)
    return failed, elapsed, monitor


def build_cases() -> list[dict]:
    cases: list[dict] = []
    by_id = {item["id"]: item for item in BASES}
    for base in BASES:
        ir = _load_ir(base["path"])
        spec = compile_spec(base["requirement"], ir.domain)
        cases.append(
            {
                "gold": base["id"],
                "topology": base["topology"],
                "fault": "clean",
                "category": "clean",
                "expected": "PASS",
                "ir": ir,
                "spec": spec,
                "requirement": base["requirement"],
                "skip_after": None,
                "take_true_branch": True,
                "expected_runtime_fail": False,
                "repair_applicable": False,
            }
        )
        for fault in FAULTS:
            try:
                mutated = mutate_ir(ir, fault)
            except InvalidMutation:
                continue
            cases.append(
                {
                    "gold": base["id"],
                    "topology": base["topology"],
                    "fault": fault,
                    "category": CATEGORY[fault],
                    "expected": mutated.expected_detection,
                    "ir": mutated.ir,
                    "spec": spec,
                    "requirement": base["requirement"],
                    "skip_after": None,
                    "take_true_branch": True,
                    "expected_runtime_fail": False,
                    "repair_applicable": True,
                    "target_node": mutated.target_node,
                    "target_edge": mutated.target_edge,
                    "fault_location": mutated.fault_location,
                    "difficulty": mutated.difficulty,
                }
            )
    for item in RUNTIME_FAULTS:
        base = by_id[item["gold"]]
        ir = _load_ir(base["path"])
        spec = compile_spec(base["requirement"], ir.domain)
        cases.append(
            {
                "gold": item["gold"],
                "topology": base["topology"],
                "fault": item["fault"],
                "category": "runtime",
                "expected": item["expected_detection"],
                "ir": ir,
                "spec": spec,
                "requirement": base["requirement"],
                "skip_after": item["skip_after"],
                "take_true_branch": item["take_true_branch"],
                "expected_runtime_fail": True,
                "repair_applicable": False,
                "repair_reason": "runtime-only fault; static repair loop does not observe skip_after / branch choice",
                "target_node": item["skip_after"] or "",
                "target_edge": "",
                "fault_location": item["skip_after"] or "",
                "diagnosis_needles": item["diagnosis_needles"],
                "note": item["note"],
            }
        )
    return cases


def evaluate_case(case: dict, mode: str) -> dict:
    dimensions = STATIC_DIMENSIONS[mode]
    started = time.perf_counter()
    result = verify_workflow(case["ir"], case["spec"], dimensions=dimensions)
    static_ms = (time.perf_counter() - started) * 1000
    run_runtime = mode in {"full", "no-safety"}
    runtime_failed = False
    runtime_ms = None
    monitor = None
    if run_runtime:
        runtime_failed, runtime_ms, monitor = _runtime(
            case["ir"],
            case["spec"],
            case.get("skip_after"),
            case.get("take_true_branch", True),
        )
    if case["fault"] == "clean":
        detected = _anomaly(result, runtime_failed)
        diagnosed = False
    elif case.get("expected_runtime_fail"):
        detected = bool(runtime_failed)
        diagnosed = bool(monitor) and _diagnosed_runtime(monitor, tuple(case.get("diagnosis_needles") or (case["expected"],)))
    else:
        detected = _anomaly(result, False)
        diagnosed = _diagnosed_static(result, case["expected"])
    row = {
        "gold": case["gold"],
        "topology": case["topology"],
        "fault": case["fault"],
        "category": case["category"],
        "expected": case["expected"],
        "detected": detected,
        "diagnosed": diagnosed,
        "codes": [issue.code for issue in result.issues],
        "static_status": result.status,
        "runtime_failed": runtime_failed,
        "runtime_issue_expected": [
            item.expected for item in (monitor.issues if monitor else []) if item.status == "FAIL"
        ],
        "static_ms": round(static_ms, 3),
        "runtime_ms": None if runtime_ms is None else round(runtime_ms, 3),
        "mode": mode,
        "repair_applicable": bool(case.get("repair_applicable")),
        "difficulty": case.get("difficulty") or "",
    }
    row["localized"] = (
        False
        if case["fault"] == "clean"
        else _localized(result, case, runtime_failed, monitor)
    )
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
    diagnosed = [r for r in faults if r.get("diagnosed")]
    loc = [r for r in faults if r.get("localized")]
    runtime_ms = [r["runtime_ms"] for r in rows if r.get("runtime_ms") is not None]
    return {
        "mode": mode,
        "closes": ABLATION_CLOSES[mode],
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
        "diagnosis_accuracy": (len(diagnosed) / len(faults)) if faults else None,
        "fault_localization_accuracy": (len(loc) / len(faults)) if faults else None,
        "average_static_ms": round(sum(r["static_ms"] for r in rows) / len(rows), 3) if rows else None,
        "average_runtime_ms": round(sum(runtime_ms) / len(runtime_ms), 3) if runtime_ms else None,
    }


def _llm_payload(case: dict) -> dict:
    payload = {"requirement": case["requirement"], "workflow": case["ir"].model_dump(mode="json")}
    leaked = [key for key in LLM_FORBIDDEN_KEYS if key in payload]
    if leaked:
        raise SystemExit(f"LLM payload leaked {leaked}")
    return payload


def llm_judge(cases: list[dict], repeats: int) -> dict:
    from veriflow_api.llm import complete

    eligible = [case for case in cases if not case.get("expected_runtime_fail") and case.get("category") != "runtime"]
    scope = {
        "evaluation_scope": "static-only",
        "eligible_case_count": len(eligible),
        "n_clean": sum(case["fault"] == "clean" for case in eligible),
        "n_faulty": sum(case["fault"] != "clean" for case in eligible),
        "excluded_runtime_case_count": len(cases) - len(eligible),
        "scope_reason": "Only requirement and complete workflow JSON are observable; runtime-only faults require an execution trace.",
        "reference_no_runtime": summarize([evaluate_case(case, "no-runtime") for case in eligible], "no-runtime"),
    }
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    provider = "deepseek"
    if not key:
        return {
            **scope,
            "status": "NOT RUN",
            "reason": "DEEPSEEK_API_KEY unset",
            "provider": provider,
            "model": model,
            "temperature": 0.0,
            "prompt_version": PROMPT_VERSION,
            "repeats": 0,
            "cases": [],
            "metrics": None,
            "note": "LLM-as-judge baseline only. Never used as Gate.",
        }
    records = []
    http_ok = 0
    http_fail = 0
    for case in eligible:
        payload = _llm_payload(case)
        dumped = json.dumps(payload, ensure_ascii=False)
        gold_label = "PASS" if case["fault"] == "clean" else "FAIL"
        for rep in range(repeats):
            started = time.perf_counter()
            result = complete(
                [
                    {
                        "role": "system",
                        "content": (
                            "You are an LLM-as-judge baseline, not VeriFlow Gate. "
                            "Reply JSON {\"verdict\":\"PASS\"} or {\"verdict\":\"FAIL\"} only."
                        ),
                    },
                    {"role": "user", "content": dumped},
                ],
                temperature=0.0,
            )
            parse_fail = False
            verdict = None
            if result.error:
                http_fail += 1
            else:
                http_ok += 1
                try:
                    parsed = json.loads(result.text)
                    if not isinstance(parsed, dict):
                        raise ValueError("Judge response must be an object")
                    verdict = str(parsed.get("verdict") or parsed.get("status") or "").upper()
                    if verdict not in {"PASS", "FAIL"}:
                        parse_fail = True
                        verdict = None
                except (ValueError, TypeError):
                    parse_fail = True
                    verdict = None
            records.append(
                {
                    "gold": case["gold"],
                    "fault": case["fault"],
                    "expected_label": gold_label,
                    "runner_call": "FAILED" if result.error else "RAN",
                    "model_verdict": verdict,
                    "parse_failure": parse_fail,
                    "abstention": verdict is None,
                    "provider": provider,
                    "model": result.model or model,
                    "temperature": 0.0,
                    "prompt_version": PROMPT_VERSION,
                    "repetition": rep + 1,
                    "latency_ms": result.latency_ms or round((time.perf_counter() - started) * 1000, 3),
                    "prompt_tokens": result.prompt_tokens,
                    "completion_tokens": result.completion_tokens,
                    "raw": (result.text or "")[:500],
                    "error": result.error,
                }
            )
    tp = fp = tn = fn = 0
    parse_n = 0
    abstention_n = failed_clean = failed_faulty = 0
    by_case: dict[tuple[str, str], list[str]] = {}
    for rec in records:
        parse_n += int(rec["parse_failure"])
        if rec["model_verdict"] is None:
            abstention_n += 1
            failed_clean += int(rec["expected_label"] == "PASS")
            failed_faulty += int(rec["expected_label"] == "FAIL")
            continue
        key = (rec["gold"], rec["fault"])
        by_case.setdefault(key, []).append(rec["model_verdict"])
        pred = rec["model_verdict"]
        gold = rec["expected_label"]
        if gold == "FAIL" and pred == "FAIL":
            tp += 1
        elif gold == "PASS" and pred == "FAIL":
            fp += 1
        elif gold == "PASS" and pred == "PASS":
            tn += 1
        else:
            fn += 1
    labeled = tp + fp + tn + fn
    precision = (tp / (tp + fp) if (tp + fp) else 0.0) if labeled else None
    recall = (tp / (tp + fn) if (tp + fn) else 0.0) if labeled else None
    f1 = (2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) else 0.0) if labeled else None
    effective_fp, effective_fn = fp + failed_clean, fn + failed_faulty
    effective_denominator = 2 * tp + effective_fp + effective_fn
    effective_f1 = (2 * tp / effective_denominator if effective_denominator else 0.0) if labeled else None
    status = "RAN" if labeled else "FAILED"
    reason = None if labeled else ("all LLM calls failed" if http_ok == 0 else "no valid verdicts returned")
    agreements = []
    for votes in by_case.values():
        if len(votes) < 2:
            continue
        majority = max(votes.count("PASS"), votes.count("FAIL"))
        agreements.append(majority / len(votes))
    return {
        **scope,
        "status": status,
        "reason": reason,
        "provider": provider,
        "model": model,
        "temperature": 0.0,
        "prompt_version": PROMPT_VERSION,
        "repeats": repeats,
        "cases": records,
        "metrics": {
            "metric_basis": "valid responses only; effective_f1 counts abstentions as FN for faults and FP for clean cases",
            "detection_precision": precision,
            "detection_recall": recall,
            "detection_f1": f1,
            "valid_response_f1": f1,
            "effective_f1": effective_f1,
            "false_positive_rate": fp / (fp + tn) if (fp + tn) else None,
            "parse_failure_count": parse_n,
            "parse_failure_rate": parse_n / http_ok if http_ok else None,
            "abstention_count": abstention_n,
            "abstention_rate": abstention_n / len(records) if records else None,
            "attempted_calls": len(records),
            "valid_confusion": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
            "effective_confusion": {"tp": tp, "fp": effective_fp, "tn": tn, "fn": effective_fn},
            "repeated_verdict_agreement": (sum(agreements) / len(agreements)) if agreements else None,
            "http_ok": http_ok,
            "http_fail": http_fail,
            "scored_calls": labeled,
        },
        "note": "LLM-as-judge baseline only. Never used as Gate / repair / publish.",
    }


def apply_repair(cases: list[dict], full_rows: list[dict]) -> tuple[list[dict], dict]:
    failures = []
    ok = 0
    n = 0
    by_key = {(row["gold"], row["fault"]): row for row in full_rows}
    for case in cases:
        key = (case["gold"], case["fault"])
        row = by_key[key]
        if case["fault"] == "clean":
            row["repaired"] = False
            row["repair_reason"] = "clean"
            continue
        if not case.get("repair_applicable"):
            row["repaired"] = False
            row["repair_applicable"] = False
            row["repair_reason"] = case.get("repair_reason") or "not applicable"
            continue
        n += 1
        row["repair_applicable"] = True
        report = verify_repair_loop(case["ir"], case["spec"], max_iterations=2)
        repaired = report.final.status == "PASS"
        row["repaired"] = repaired
        row["repair_reason"] = "accepted" if repaired else (report.steps[-1].reason if report.steps else "rejected")
        if repaired:
            ok += 1
        else:
            failures.append(
                {
                    "gold": case["gold"],
                    "fault": case["fault"],
                    "reason": row["repair_reason"],
                }
            )
    stats = {
        "repair_applicable_count": n,
        "repair_success_count": ok,
        "repair_failure_count": n - ok,
        "repair_success_rate": (ok / n) if n else None,
        "repair_failures": failures,
    }
    return full_rows, stats


def _write_readme(metrics: dict, ablation: dict, llm: dict) -> str:
    bases = metrics["base_workflows"]
    families = metrics["topology_families"]
    lines = [
        "# Competition benchmark",
        "",
        "Deterministic enumeration. No sampling randomness.",
        f"`SEED={SEED}` is provenance only; it does not drive an RNG.",
        "",
        "Re-run:",
        "",
        "```",
        "python scripts/competition_benchmark.py",
        "python scripts/competition_benchmark.py --llm-repeats 3",
        "```",
        "",
        f"- dataset: `{metrics['dataset']}`",
        f"- base_workflows: {metrics['base_workflow_count']} ({', '.join(bases)})",
        f"- topology_families: {metrics['base_topology_count']} ({', '.join(families)})",
        f"- clean: {metrics['n_clean']}",
        f"- faulty: {metrics['n_faulty']}",
        f"- runtime_fault_count: {metrics['runtime_fault_count']}",
        f"- total: {metrics['total']}",
        f"- detection F1: {metrics['detection_f1']:.3f}",
        f"- diagnosis accuracy: {metrics['diagnosis_accuracy']:.3f}"
        if isinstance(metrics.get("diagnosis_accuracy"), float)
        else "- diagnosis accuracy: n/a",
        f"- LLM-as-judge: {llm['status']}" + (f" ({llm.get('reason')})" if llm.get("reason") else ""),
        "",
        "Ablations (same cases, same order):",
        "",
    ]
    for mode in MODES:
        row = ablation[mode]
        lines.append(
            f"- `{mode}`: {row['closes']}  F1={row['detection_f1']:.3f}  recall={row['detection_recall']:.3f}"
        )
    lines.extend(
        [
            "",
            "Detection = verifier found *an* anomaly on a mutated workflow.",
            "Diagnosis = issue code (or runtime expected text) matches the injected fault.",
            "Runtime-only faults are excluded from the static repair success denominator.",
            "incremental speedup: NOT MEASURED.",
            "This is a repository-internal synthetic mutation suite. Not a public leaderboard. Not SOTA.",
            "",
        ]
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--llm-repeats", type=int, default=3)
    args = parser.parse_args(argv)
    repeats = max(1, args.llm_repeats)

    OUT.mkdir(parents=True, exist_ok=True)
    cases = build_cases()
    cats = {c["category"] for c in cases if c["fault"] != "clean"}
    missing = [c for c in REQUIRED_CATEGORIES if c not in cats]
    if missing:
        raise SystemExit(f"competition suite missing categories: {missing}")

    for base in BASES:
        ir = _load_ir(base["path"])
        spec = compile_spec(base["requirement"], ir.domain)
        static = verify_workflow(ir, spec)
        runtime_failed, _, _ = _runtime(ir, spec, None, True)
        if static.status != "PASS" or runtime_failed:
            raise SystemExit(
                f"clean base {base['id']} does not pass verifier "
                f"(static={static.status} runtime_fail={runtime_failed} codes={[i.code for i in static.issues]})"
            )

    ablation: dict[str, dict] = {}
    full_rows: list[dict] = []
    for mode in MODES:
        rows = [evaluate_case(case, mode) for case in cases]
        ablation[mode] = summarize(rows, mode)
        if mode == "full":
            full_rows = rows

    full_rows, repair_stats = apply_repair(cases, full_rows)
    llm = llm_judge(cases, repeats)
    full_metrics = ablation["full"]
    n_clean = sum(1 for c in cases if c["fault"] == "clean")
    n_faulty = sum(1 for c in cases if c["fault"] != "clean")
    runtime_n = sum(1 for c in cases if c["category"] == "runtime")
    families = sorted({b["topology"] for b in BASES})
    metrics = {
        **full_metrics,
        **repair_stats,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "suite": "competition",
        "seed": SEED,
        "seed_role": "provenance_only",
        "sampling": "deterministic_enumeration",
        "dataset": "competition-v2",
        "command": "python scripts/competition_benchmark.py",
        "base_workflows": [b["id"] for b in BASES],
        "base_workflow_count": len(BASES),
        "topology_families": families,
        "base_topology_count": len(families),
        "n_clean": n_clean,
        "n_faulty": n_faulty,
        "n": n_faulty,
        "total": n_clean + n_faulty,
        "runtime_fault_count": runtime_n,
        "categories": sorted(cats),
        "category_counts": dict(Counter(c["category"] for c in cases if c["fault"] != "clean")),
        "incremental_verification_latency": "NOT MEASURED",
        "speedup": "NOT MEASURED",
        "incremental_full_disagreement_count": "NOT MEASURED",
        "llm_judge_baseline": llm["status"],
        "note": "Synthetic mutation benchmark. Repository-internal. Not a public leaderboard. Not SOTA.",
    }
    slim = [{k: v for k, v in row.items()} for row in full_rows]
    (OUT / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "ablation.json").write_text(json.dumps(ablation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "cases.json").write_text(json.dumps(slim, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (OUT / "cases.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "gold",
                "fault",
                "category",
                "expected",
                "detected",
                "diagnosed",
                "localized",
                "repair_applicable",
                "repaired",
                "repair_reason",
                "codes",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        for row in slim:
            writer.writerow({**row, "codes": "|".join(row.get("codes") or [])})
    (OUT / "llm_judge.json").write_text(json.dumps(llm, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    readme = _write_readme(metrics, ablation, llm)
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    print(readme)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
