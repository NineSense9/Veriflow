from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from veriflow_explain.minimize import minimize_issue
from veriflow_ir.workflow import WorkflowIR
from veriflow_mutate.ir_faults import FAULTS, InvalidMutation, mutate_ir
from veriflow_repair.loop import verify_repair_loop
from veriflow_spec.compiler import compile_spec
from veriflow_verify.result import verify_workflow


def run_fault_bench(gold: WorkflowIR, out_dir: Path | None = None) -> dict:
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。", gold.domain)
    cases: list[dict] = []
    tp = fp = fn = 0
    loc_ok = 0
    repair_ok = 0
    orig_nodes: list[int] = []
    mini_nodes: list[int] = []
    by_diff: dict[str, list[bool]] = {"EASY": [], "MEDIUM": [], "HARD": []}
    false_negatives: list[dict] = []
    repair_failures: list[dict] = []
    tn = 0
    clean = verify_workflow(gold, spec)
    if clean.status == "PASS" and not any(i.severity in {"HIGH", "CRITICAL"} for i in clean.issues):
        tn += 1
    else:
        fp += 1
    cases.append(
        {
            "fault": "clean",
            "difficulty": "EASY",
            "category": "clean",
            "expected": "PASS",
            "detected": clean.status != "PASS",
            "localized": False,
            "node_top1": False,
            "edge_top1": False,
            "codes": [issue.code for issue in clean.issues],
            "repaired": True,
            "repair_iterations": 0,
            "changed_nodes": 0,
            "patch_operations": 0,
            "regression_rate": 0.0,
            "repair_reason": "n/a",
        }
    )
    for fault in FAULTS:
        try:
            mutated = mutate_ir(gold, fault)
        except InvalidMutation:
            continue
        result = verify_workflow(mutated.ir, spec)
        aliases = {
            "WEAK_BOUNDS": {"WEAK_BOUNDS", "MISSING_REQUIRED_ACTION"},
            "ORDER_VIOLATION": {"ORDER_VIOLATION", "MISSING_HUMAN_GATE"},
            "BROKEN_BINDING": {"BROKEN_BINDING", "ORDER_VIOLATION"},
        }
        allowed = {mutated.expected_detection, *aliases.get(mutated.expected_detection, set())}
        detected = any(issue.code in allowed for issue in result.issues)
        localized = any(
            mutated.fault_location in issue.affected_nodes
            or mutated.fault_location in issue.witness_path
            or mutated.target_node in issue.affected_nodes
            or (mutated.target_edge and mutated.target_edge in issue.affected_edges)
            or mutated.fault_location in (issue.actual or "")
            or mutated.fault_location in (issue.description or "")
            for issue in result.issues
        )
        node_top1 = bool(result.issues) and mutated.target_node in (result.issues[0].affected_nodes[:1] or [""])
        edge_top1 = bool(mutated.target_edge) and any(
            mutated.target_edge in issue.affected_edges for issue in result.issues
        )
        by_diff.setdefault(mutated.difficulty, []).append(detected)
        if detected:
            tp += 1
        else:
            fn += 1
            false_negatives.append(
                {
                    "fault": fault,
                    "difficulty": mutated.difficulty,
                    "expected": mutated.expected_detection,
                    "codes": [issue.code for issue in result.issues],
                }
            )
        if localized:
            loc_ok += 1
        if result.issues:
            orig_nodes.append(len(mutated.ir.nodes))
            mini = minimize_issue(mutated.ir, result.issues[0])
            mini_nodes.append(len(mini.minimized_nodes) or 1)
        report = verify_repair_loop(mutated.ir, spec, max_iterations=3)
        repaired = report.final.status == "PASS"
        if repaired:
            repair_ok += 1
        else:
            repair_failures.append(
                {
                    "fault": fault,
                    "codes": [issue.code for issue in result.issues],
                    "reason": report.steps[-1].reason if report.steps else "NO_PLAN",
                    "repair_mode": report.repair_mode,
                    "patch_operations": report.patch_operations,
                }
            )
        cases.append(
            {
                "fault": fault,
                "difficulty": mutated.difficulty,
                "category": mutated.fault_category,
                "expected": mutated.expected_detection,
                "detected": detected,
                "localized": localized,
                "node_top1": node_top1,
                "edge_top1": edge_top1,
                "codes": [issue.code for issue in result.issues],
                "repaired": repaired,
                "repair_iterations": report.iterations,
                "changed_nodes": report.changed_nodes,
                "patch_operations": report.patch_operations,
                "regression_rate": report.regression_rate,
                "repair_reason": report.steps[-1].reason if report.steps else ("PASS" if repaired else "NO_PLAN"),
            }
        )
    faults = [item for item in cases if item["fault"] != "clean"]
    n = len(faults) or 1
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    metrics = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gold": gold.name,
        "n": n,
        "n_clean": 1,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "detection_precision": precision,
        "detection_recall": recall,
        "detection_f1": f1,
        "false_positive_rate": fp / (fp + tn) if (fp + tn) else 0.0,
        "false_negative_rate": fn / (fn + tp) if (fn + tp) else 0.0,
        "fault_localization_accuracy": loc_ok / n,
        "repair_success_rate": repair_ok / n,
        "post_repair_pass_rate": repair_ok / n,
        "average_repair_iterations": sum(item["repair_iterations"] for item in faults) / n,
        "average_patch_operations": sum(item["patch_operations"] for item in faults) / n,
        "average_changed_nodes": sum(item["changed_nodes"] for item in faults) / n,
        "repair_regression_rate": sum(item["regression_rate"] for item in faults) / n,
        "node_top1_localization": sum(1 for item in faults if item["node_top1"]) / n,
        "edge_top1_localization": sum(1 for item in faults if item["edge_top1"]) / n,
        "llm_judge_baseline": "N/A",
        "average_original_affected_nodes": (sum(orig_nodes) / len(orig_nodes)) if orig_nodes else None,
        "average_minimized_witness_nodes": (sum(mini_nodes) / len(mini_nodes)) if mini_nodes else None,
        "witness_reduction_ratio": (
            1.0 - (sum(mini_nodes) / sum(orig_nodes)) if orig_nodes and sum(orig_nodes) else None
        ),
        "easy_recall": (sum(by_diff["EASY"]) / len(by_diff["EASY"])) if by_diff["EASY"] else None,
        "medium_recall": (sum(by_diff["MEDIUM"]) / len(by_diff["MEDIUM"])) if by_diff["MEDIUM"] else None,
        "hard_recall": (sum(by_diff["HARD"]) / len(by_diff["HARD"])) if by_diff["HARD"] else None,
        "false_negatives": false_negatives,
        "repair_failures": repair_failures,
        "cases": cases,
        "note": "measured on gold compose IR + synthetic mutations; NOT a published leaderboard",
    }
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
        with (out_dir / "cases.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=["fault", "category", "expected", "detected", "localized", "repaired", "repair_iterations", "codes"],
                extrasaction="ignore",
            )
            writer.writeheader()
            for row in cases:
                writer.writerow({**row, "codes": "|".join(row["codes"])})
        (out_dir / "report.md").write_text(_markdown(metrics), encoding="utf-8")
        (out_dir / "false_negatives.json").write_text(
            json.dumps(false_negatives, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (out_dir / "repair_failures.json").write_text(
            json.dumps(repair_failures, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return metrics


def run_dev_bench(root: Path, out_dir: Path | None = None) -> dict:
    """Clean + fault on multiple in-repo gold IRs. Still not an external leaderboard."""
    paths = [
        root / "examples/compose/valid_lis.json",
        root / "examples/ci/commit_a.json",
        root / "examples/golden/case4_runtime_ir.json",
    ]
    all_cases: list[dict] = []
    tp = fp = tn = fn = 0
    repair_ok = 0
    n_fault = 0
    for path in paths:
        if not path.exists():
            continue
        ir = WorkflowIR.model_validate_json(path.read_text(encoding="utf-8"))
        part = run_fault_bench(ir)
        tp += part.get("tp", 0)
        fp += part.get("fp", 0)
        tn += part.get("tn", 0)
        fn += part.get("fn", 0)
        for case in part["cases"]:
            case["gold"] = ir.name
            all_cases.append(case)
            if case["fault"] != "clean":
                n_fault += 1
                if case.get("repaired"):
                    repair_ok += 1
    n = n_fault or 1
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    metrics = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "suite": "dev",
        "golds": [p.name for p in paths if p.exists()],
        "n": n,
        "n_clean": sum(1 for c in all_cases if c["fault"] == "clean"),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "detection_precision": precision,
        "detection_recall": recall,
        "detection_f1": f1,
        "false_positive_rate": fp / (fp + tn) if (fp + tn) else 0.0,
        "false_negative_rate": fn / (fn + tp) if (fn + tp) else 0.0,
        "repair_success_rate": repair_ok / n,
        "fault_localization_accuracy": (
            sum(1 for c in all_cases if c["fault"] != "clean" and c.get("localized")) / n
        ),
        "repair_failures": [
            {"gold": c.get("gold"), "fault": c["fault"], "reason": c.get("repair_reason"), "codes": c.get("codes")}
            for c in all_cases
            if c["fault"] != "clean" and not c.get("repaired")
        ],
        "cases": all_cases,
        "note": "in-repo gold IRs + mutations; not an external leaderboard",
    }
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
        (out_dir / "report.md").write_text(_markdown(metrics), encoding="utf-8")
    return metrics


def _markdown(metrics: dict) -> str:
    lines = [
        "# Veriflow IR fault-injection smoke",
        "",
        f"- gold: `{metrics.get('gold') or ','.join(metrics.get('golds') or [])}`",
        f"- n: {metrics['n']}",
        f"- detection P/R/F1: {metrics['detection_precision']:.2f} / {metrics['detection_recall']:.2f} / {metrics['detection_f1']:.2f}",
        f"- localization accuracy: {metrics.get('fault_localization_accuracy', 0):.2f}",
        f"- repair success: {metrics.get('repair_success_rate', 0):.2f}",
        f"- TP/FP/TN/FN: {metrics.get('tp')}/{metrics.get('fp')}/{metrics.get('tn')}/{metrics.get('fn')}",
        "",
        "These numbers come from running mutations on the in-repo gold IR. They are not a published leaderboard.",
        "",
    ]
    return "\n".join(lines)
