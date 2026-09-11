from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.candidate import CandidateEvaluation, RepairCandidate
from veriflow_repair.diff import graph_diff
from veriflow_repair.patch import Patch
from veriflow_repair.select import PickStats, pick_plan
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.ai_trace import AIInvocationTrace
from veriflow_verify.incremental import incremental_verify
from veriflow_verify.result import VerificationResult, verify_workflow


class RepairStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    iteration: int
    accepted: bool
    reason: str
    previous_status: str
    new_status: str
    previous_quality: int = 0
    new_quality: int = 0
    patches: list[Patch] = Field(default_factory=list)
    issues_fixed: int = 0
    issues_remaining: int = 0
    candidates_evaluated: int = 0
    candidates_rejected_guard: int = 0
    candidates_rejected_incremental: int = 0
    candidates_fully_verified: int = 0
    changed_nodes: int = 0
    changed_edges: int = 0
    changed_parameters: int = 0
    reevaluated_constraints: int = 0
    candidates: list[RepairCandidate] = Field(default_factory=list)
    evaluations: list[CandidateEvaluation] = Field(default_factory=list)
    selected_candidate_id: str | None = None
    ai_trace: AIInvocationTrace | None = None


class RepairReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ir: WorkflowIR
    initial: VerificationResult
    final: VerificationResult
    steps: list[RepairStep] = Field(default_factory=list)
    iterations: int = 0
    improved: bool = False
    changed_nodes: int = 0
    changed_edges: int = 0
    changed_parameters: int = 0
    patch_operations: int = 0
    regression_rate: float = 0.0
    candidates_generated: int = 0
    candidates_rejected_guard: int = 0
    candidates_rejected_incremental: int = 0
    candidates_fully_verified: int = 0
    selected_candidate: str = ""
    selected_candidate_id: str | None = None
    final_decision: str = ""
    candidates: list[RepairCandidate] = Field(default_factory=list)
    evaluations: list[CandidateEvaluation] = Field(default_factory=list)
    ai_trace: AIInvocationTrace | None = None
    impact_nodes: list[str] = Field(default_factory=list)
    reevaluated_constraints: int = 0
    total_constraints: int = 0
    used_full_fallback: bool = True
    repair_mode: str = "PATCH"
    affected_verifiers: list[str] = Field(default_factory=list)
    impact_reason: str = ""


def verify_repair_loop(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    max_iterations: int = 3,
    allow_ai: bool = True,
) -> RepairReport:
    initial = verify_workflow(ir, spec)
    current = ir
    current_result = initial
    steps: list[RepairStep] = []
    rejected = 0
    if initial.status == "PASS":
        return RepairReport(ir=current, initial=initial, final=initial, iterations=0, improved=False)
    seen: set[str] = set()
    stats = PickStats()
    for iteration in range(1, max_iterations + 1):
        fingerprint = "|".join(
            sorted(f"{item.code}:{','.join(item.affected_nodes)}" for item in current_result.issues)
        )
        if fingerprint in seen:
            steps.append(
                RepairStep(
                    iteration=iteration,
                    accepted=False,
                    reason="duplicate failure",
                    previous_status=current_result.status,
                    new_status=current_result.status,
                    issues_remaining=len(current_result.issues),
                )
            )
            break
        seen.add(fingerprint)
        plan, after, nxt, decision, stats = pick_plan(current, spec, current_result, k=3, allow_ai=allow_ai)
        accepted = decision == "REPAIR_ACCEPTED" and nxt is not None and after is not None
        if not accepted:
            rejected += 1
            steps.append(
                RepairStep(
                    iteration=iteration,
                    accepted=False,
                    reason=decision,
                    previous_status=current_result.status,
                    new_status=current_result.status,
                    patches=plan or [],
                    issues_remaining=len(current_result.issues),
                    candidates_evaluated=stats.generated,
                    candidates_rejected_guard=stats.rejected_guard,
                    candidates_rejected_incremental=stats.rejected_incremental,
                    candidates_fully_verified=stats.fully_verified,
                    candidates=list(stats.candidates),
                    evaluations=list(stats.evaluations),
                    selected_candidate_id=stats.selected_candidate_id,
                    ai_trace=stats.ai_trace,
                )
            )
            break
        assert after is not None and nxt is not None and plan is not None
        diff = graph_diff(current, nxt)
        impact = incremental_verify(current, nxt, spec, previous=current_result)
        steps.append(
            RepairStep(
                iteration=iteration,
                accepted=True,
                reason=decision,
                previous_status=current_result.status,
                new_status=after.status,
                patches=plan,
                issues_fixed=max(len(current_result.issues) - len(after.issues), 0),
                issues_remaining=len(after.issues),
                candidates_evaluated=stats.generated,
                candidates_rejected_guard=stats.rejected_guard,
                candidates_rejected_incremental=stats.rejected_incremental,
                candidates_fully_verified=stats.fully_verified,
                changed_nodes=diff["changed_nodes"],
                changed_edges=diff["changed_edges"],
                changed_parameters=diff["changed_parameters"],
                reevaluated_constraints=impact.reevaluated_constraints,
                candidates=list(stats.candidates),
                evaluations=list(stats.evaluations),
                selected_candidate_id=stats.selected_candidate_id,
                ai_trace=stats.ai_trace,
            )
        )
        current = nxt
        current_result = after
        if after.status == "PASS":
            break
    total_diff = graph_diff(ir, current)
    attempts = max(len(steps), 1)
    closing = incremental_verify(ir, current, spec, previous=initial)
    return RepairReport(
        ir=current,
        initial=initial,
        final=current_result,
        steps=steps,
        iterations=len(steps),
        improved=current_result.status == "PASS" or len(current_result.issues) < len(initial.issues),
        changed_nodes=total_diff["changed_nodes"],
        changed_edges=total_diff["changed_edges"],
        changed_parameters=total_diff["changed_parameters"],
        patch_operations=sum(len(step.patches) for step in steps if step.accepted),
        regression_rate=rejected / attempts,
        candidates_generated=sum(step.candidates_evaluated for step in steps),
        candidates_rejected_guard=sum(step.candidates_rejected_guard for step in steps),
        candidates_rejected_incremental=sum(step.candidates_rejected_incremental for step in steps),
        candidates_fully_verified=sum(step.candidates_fully_verified for step in steps),
        selected_candidate=next((step.reason for step in reversed(steps) if step.accepted), ""),
        selected_candidate_id=stats.selected_candidate_id,
        final_decision=stats.selected or next((step.reason for step in reversed(steps)), ""),
        candidates=list(stats.candidates),
        evaluations=list(stats.evaluations),
        ai_trace=stats.ai_trace,
        impact_nodes=closing.impact.affected_nodes,
        reevaluated_constraints=closing.reevaluated_constraints,
        total_constraints=closing.total_constraints,
        used_full_fallback=closing.used_full_fallback,
        repair_mode="PATCH",
        affected_verifiers=list(closing.impact.affected_verifiers),
        impact_reason=closing.impact.reason,
    )
