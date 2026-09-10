from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.diff import graph_diff
from veriflow_repair.executor import apply_patches
from veriflow_repair.guard import validate_patches
from veriflow_repair.patch import Patch
from veriflow_repair.planner import plan_patches
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.issue import Issue
from veriflow_verify.result import VerificationResult, verify_workflow

HIGH = {"HIGH", "CRITICAL"}


def plan_candidates(ir: WorkflowIR, issues: list[Issue], k: int = 3) -> list[list[Patch]]:
    plans: list[list[Patch]] = []
    primary = plan_patches(ir, issues)
    if primary:
        plans.append(primary)
    if len(issues) > 1:
        rotated = plan_patches(ir, issues[1:] + issues[:1])
        if rotated and rotated != primary:
            plans.append(rotated)
    safety_first = plan_patches(ir, [item for item in issues if item.category == "safety"] or issues)
    if safety_first and safety_first not in plans:
        plans.append(safety_first)
    unique: list[list[Patch]] = []
    seen: set[str] = set()
    for plan in plans:
        key = repr([item.model_dump() for item in plan])
        if key in seen:
            continue
        seen.add(key)
        unique.append(plan)
        if len(unique) >= k:
            break
    return unique


def target_fixed(before: VerificationResult, after: VerificationResult, target: Issue | None) -> bool:
    if target is None:
        return len(after.issues) < len(before.issues)
    return not any(item.code == target.code and item.affected_nodes == target.affected_nodes for item in after.issues)


def new_high_count(before: VerificationResult, after: VerificationResult) -> int:
    prior = {(item.code, tuple(item.affected_nodes)) for item in before.issues if item.severity in HIGH}
    return sum(
        1
        for item in after.issues
        if item.severity in HIGH and (item.code, tuple(item.affected_nodes)) not in prior
    )


def exec_degraded(before: VerificationResult, after: VerificationResult) -> bool:
    before_exec = any(item.category == "executable" for item in before.issues)
    after_exec = any(item.category == "executable" for item in after.issues)
    return after_exec and not before_exec


def lex_key(
    before: VerificationResult,
    after: VerificationResult,
    target: Issue | None,
    patches: list[Patch],
    before_ir: WorkflowIR,
    after_ir: WorkflowIR,
) -> tuple:
    diff = graph_diff(before_ir, after_ir)
    return (
        0 if target_fixed(before, after, target) else 1,
        new_high_count(before, after),
        after.constraints_failed,
        1 if exec_degraded(before, after) else 0,
        diff["changed_nodes"],
        diff["changed_edges"],
        diff["changed_parameters"],
        len(patches),
    )


def accept_candidate(before: VerificationResult, after: VerificationResult, target: Issue | None) -> str:
    if not target_fixed(before, after, target):
        return "REPAIR_REJECTED_NO_IMPROVEMENT"
    if new_high_count(before, after) > 0:
        return "REPAIR_REJECTED_REGRESSION"
    if exec_degraded(before, after):
        return "REPAIR_REJECTED_REGRESSION"
    before_struct = any(item.category == "structural" for item in before.issues)
    after_struct = any(item.category == "structural" for item in after.issues)
    if after_struct and not before_struct:
        return "REPAIR_REJECTED_REGRESSION"
    return "REPAIR_ACCEPTED"


def pick_plan(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    before: VerificationResult,
    k: int = 3,
) -> tuple[list[Patch] | None, VerificationResult | None, WorkflowIR | None, str, int]:
    target = before.issues[0] if before.issues else None
    candidates = plan_candidates(ir, before.issues, k=k)
    ranked: list[tuple[tuple, list[Patch], VerificationResult, WorkflowIR]] = []
    for plan in candidates:
        ok, reason = validate_patches(ir, plan)
        if not ok:
            continue
        nxt = apply_patches(ir, plan)
        after = verify_workflow(nxt, spec)
        ranked.append((lex_key(before, after, target, plan, ir, nxt), plan, after, nxt))
    if not ranked:
        return None, None, None, "REPAIR_REJECTED_INVALID_PATCH", len(candidates)
    ranked.sort(key=lambda item: item[0])
    _key, plan, after, nxt = ranked[0]
    decision = accept_candidate(before, after, target)
    if decision != "REPAIR_ACCEPTED":
        return plan, after, ir, decision, len(candidates)
    return plan, after, nxt, decision, len(candidates)
