from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.diff import graph_diff
from veriflow_repair.executor import apply_patches
from veriflow_repair.guard import validate_patches
from veriflow_repair.patch import Patch
from veriflow_repair.planner import plan_patches
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.incremental import incremental_verify
from veriflow_verify.issue import Issue
from veriflow_verify.result import VerificationResult, verify_workflow

HIGH = {"HIGH", "CRITICAL"}


class PickStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generated: int = 0
    rejected_guard: int = 0
    rejected_incremental: int = 0
    fully_verified: int = 0
    selected: str = ""


def plan_candidates(
    ir: WorkflowIR,
    issues: list[Issue],
    k: int = 3,
    spec: WorkflowSpec | None = None,
) -> list[list[Patch]]:
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
    extra: list[list[Patch]] = []
    if spec is not None:
        from veriflow_repair.ai_planner import propose_ai_patches

        extra, _reason = propose_ai_patches(ir, spec, issues)
        for plan in extra:
            key = repr([item.model_dump() for item in plan])
            if key in seen:
                continue
            seen.add(key)
            unique.append(plan)
    mixed: list[list[Patch]] = []
    if extra:
        mixed.append(extra[0])
    for plan in unique:
        if plan in mixed:
            continue
        mixed.append(plan)
        if len(mixed) >= k:
            break
    return mixed or unique[:k]


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


def _promising(before: VerificationResult, screened: VerificationResult, target: Issue | None) -> bool:
    if target_fixed(before, screened, target):
        return True
    if len(screened.issues) < len(before.issues):
        return True
    if screened.constraints_failed < before.constraints_failed:
        return True
    return False


def pick_plan(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    before: VerificationResult,
    k: int = 3,
) -> tuple[list[Patch] | None, VerificationResult | None, WorkflowIR | None, str, PickStats]:
    target = before.issues[0] if before.issues else None
    candidates = plan_candidates(ir, before.issues, k=k, spec=spec)
    stats = PickStats(generated=len(candidates))
    ranked: list[tuple[tuple, list[Patch], VerificationResult, WorkflowIR]] = []
    for plan in candidates:
        ok, _reason = validate_patches(ir, plan)
        if not ok:
            stats.rejected_guard += 1
            continue
        nxt = apply_patches(ir, plan)
        screened = incremental_verify(ir, nxt, spec, previous=before)
        if not _promising(before, screened.result, target):
            stats.rejected_incremental += 1
            continue
        after = verify_workflow(nxt, spec)
        stats.fully_verified += 1
        ranked.append((lex_key(before, after, target, plan, ir, nxt), plan, after, nxt))
    if not ranked:
        decision = "REPAIR_REJECTED_INVALID_PATCH" if stats.rejected_guard == stats.generated else "REPAIR_REJECTED_NO_IMPROVEMENT"
        return None, None, None, decision, stats
    ranked.sort(key=lambda item: item[0])
    _key, plan, after, nxt = ranked[0]
    decision = accept_candidate(before, after, target)
    stats.selected = decision
    if decision != "REPAIR_ACCEPTED":
        return plan, after, ir, decision, stats
    return plan, after, nxt, decision, stats
