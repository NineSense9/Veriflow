from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.executor import apply_patches
from veriflow_repair.guard import validate_patches
from veriflow_repair.patch import Patch
from veriflow_repair.planner import plan_patches
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import VerificationResult, quality, verify_workflow


class RepairStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    iteration: int
    accepted: bool
    reason: str
    previous_status: str
    new_status: str
    previous_quality: int
    new_quality: int
    patches: list[Patch] = Field(default_factory=list)
    issues_fixed: int = 0
    issues_remaining: int = 0


class RepairReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ir: WorkflowIR
    initial: VerificationResult
    final: VerificationResult
    steps: list[RepairStep] = Field(default_factory=list)
    iterations: int = 0
    improved: bool = False


def verify_repair_loop(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    max_iterations: int = 3,
) -> RepairReport:
    initial = verify_workflow(ir, spec)
    current = ir
    current_result = initial
    steps: list[RepairStep] = []
    if initial.status == "PASS":
        return RepairReport(
            ir=current, initial=initial, final=initial, iterations=0, improved=False
        )
    seen: set[str] = set()
    for iteration in range(1, max_iterations + 1):
        fingerprint = "|".join(sorted(f"{item.code}:{','.join(item.affected_nodes)}" for item in current_result.issues))
        if fingerprint in seen:
            steps.append(
                RepairStep(
                    iteration=iteration,
                    accepted=False,
                    reason="duplicate failure",
                    previous_status=current_result.status,
                    new_status=current_result.status,
                    previous_quality=quality(current_result),
                    new_quality=quality(current_result),
                    issues_remaining=len(current_result.issues),
                )
            )
            break
        seen.add(fingerprint)
        patches = plan_patches(current, current_result.issues)
        ok, reason = validate_patches(current, patches)
        if not ok:
            steps.append(
                RepairStep(
                    iteration=iteration,
                    accepted=False,
                    reason=reason,
                    previous_status=current_result.status,
                    new_status=current_result.status,
                    previous_quality=quality(current_result),
                    new_quality=quality(current_result),
                    patches=patches,
                    issues_remaining=len(current_result.issues),
                )
            )
            break
        nxt = apply_patches(current, patches)
        after = verify_workflow(nxt, spec)
        prev_q = quality(current_result)
        new_q = quality(after)
        accepted = new_q > prev_q or (
            after.status == "PASS" and current_result.status != "PASS"
        ) or len(after.issues) < len(current_result.issues)
        steps.append(
            RepairStep(
                iteration=iteration,
                accepted=accepted,
                reason="improved" if accepted else "rollback, quality did not improve",
                previous_status=current_result.status,
                new_status=after.status,
                previous_quality=prev_q,
                new_quality=new_q,
                patches=patches,
                issues_fixed=max(len(current_result.issues) - len(after.issues), 0),
                issues_remaining=len(after.issues),
            )
        )
        if not accepted:
            break
        current = nxt
        current_result = after
        if after.status == "PASS":
            break
    return RepairReport(
        ir=current,
        initial=initial,
        final=current_result,
        steps=steps,
        iterations=len(steps),
        improved=quality(current_result) > quality(initial) or current_result.status == "PASS",
    )
