from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.patch import Patch
from veriflow_repair.strategies import insert_gate, insert_guard, plan_for_issue
from veriflow_verify.issue import Issue

BOUNDS_EXPR = "spec.n_min >= 1 && spec.n_max <= 100000"


def plan_patches(ir: WorkflowIR, issues: list[Issue]) -> list[Patch]:
    rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    ordered = sorted(issues, key=lambda item: rank[item.severity])
    for issue in ordered:
        batch, _strategy = plan_for_issue(ir, issue)
        if batch:
            return batch
    return []


def _insert_gate(ir: WorkflowIR) -> list[Patch]:
    return insert_gate(ir)


def _insert_guard(ir: WorkflowIR) -> list[Patch]:
    return insert_guard(ir)
