from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

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
        if detected:
            tp += 1
        else:
            fn += 1
        if localized:
            loc_ok += 1
        report = verify_repair_loop(mutated.ir, spec, max_iterations=3)
        repaired = report.final.status == "PASS"
        if repaired:
            repair_ok += 1
        cases.append(
            {
                "fault": fault,
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
            }
        )
    n = len(cases) or 1
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    metrics = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gold": gold.name,
        "n": n,
        "detection_precision": precision,
        "detection_recall": recall,
        "detection_f1": f1,
        "false_positive_rate": fp / n,
        "false_negative_rate": fn / n,
        "fault_localization_accuracy": loc_ok / n,
        "repair_success_rate": repair_ok / n,
        "post_repair_pass_rate": repair_ok / n,
        "average_repair_iterations": sum(item["repair_iterations"] for item in cases) / n,
        "average_patch_operations": sum(item["patch_operations"] for item in cases) / n,
        "average_changed_nodes": sum(item["changed_nodes"] for item in cases) / n,
        "repair_regression_rate": sum(item["regression_rate"] for item in cases) / n,
        "node_top1_localization": sum(1 for item in cases if item["node_top1"]) / n,
        "edge_top1_localization": sum(1 for item in cases if item["edge_top1"]) / n,
        "llm_judge_baseline": "N/A",
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
    return metrics


def _markdown(metrics: dict) -> str:
    lines = [
        "# Veriflow IR fault-injection smoke",
        "",
        f"- gold: `{metrics['gold']}`",
        f"- n: {metrics['n']}",
        f"- detection P/R/F1: {metrics['detection_precision']:.2f} / {metrics['detection_recall']:.2f} / {metrics['detection_f1']:.2f}",
        f"- localization accuracy: {metrics['fault_localization_accuracy']:.2f}",
        f"- repair success: {metrics['repair_success_rate']:.2f}",
        "",
        "These numbers come from running mutations on the in-repo gold IR. They are not a published leaderboard.",
        "",
    ]
    return "\n".join(lines)
