from __future__ import annotations

import time

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.candidate import (
    STAGES,
    CandidateEvaluation,
    GuardStageResult,
    RepairCandidate,
    skip_rest,
)
from veriflow_repair.diff import graph_diff
from veriflow_repair.executor import apply_patches
from veriflow_repair.guard import validate_patches
from veriflow_repair.patch import Patch
from veriflow_repair.planner import plan_patches
from veriflow_spec.models import WorkflowSpec
from veriflow_staticcheck.whitelist import DOMAIN_TOOLS
from veriflow_verify.ai_trace import AIInvocationTrace
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
    selected_candidate_id: str | None = None
    evaluations: list[CandidateEvaluation] = Field(default_factory=list)
    candidates: list[RepairCandidate] = Field(default_factory=list)
    ai_trace: AIInvocationTrace | None = None


def _rule_candidates(ir: WorkflowIR, issues: list[Issue]) -> list[RepairCandidate]:
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
    target = issues[0].id if issues else None
    return [
        RepairCandidate(id=f"rule-{index:02d}", source="rule", target_issue_id=target, patches=plan, rationale="deterministic planner")
        for index, plan in enumerate(unique, start=1)
    ]


def plan_candidates(
    ir: WorkflowIR,
    issues: list[Issue],
    k: int = 3,
    spec: WorkflowSpec | None = None,
    allow_ai: bool = True,
) -> tuple[list[RepairCandidate], AIInvocationTrace | None]:
    rules = _rule_candidates(ir, issues)
    extra: list[RepairCandidate] = []
    ai_trace: AIInvocationTrace | None
    if not allow_ai:
        ai_trace = AIInvocationTrace(
            stage="repair",
            requested=False,
            used=False,
            status="NOT_USED",
            prompt_version="repair-v1",
        )
    elif spec is not None:
        from veriflow_repair.ai_planner import propose_ai_candidates

        extra, ai_trace = propose_ai_candidates(ir, spec, issues)
    else:
        ai_trace = AIInvocationTrace(
            stage="repair",
            requested=False,
            used=False,
            status="NOT_USED",
            prompt_version="repair-v1",
        )
    mixed: list[RepairCandidate] = []
    seen: set[str] = set()
    if extra:
        mixed.append(extra[0])
        seen.add(extra[0].id)
    for cand in rules + extra:
        if cand.id in seen:
            continue
        seen.add(cand.id)
        mixed.append(cand)
        if len(mixed) >= k:
            break
    return mixed or rules[:k], ai_trace


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


def _stage(name, status, reason="", ms=None) -> GuardStageResult:
    return GuardStageResult(name=name, status=status, reason=reason, latency_ms=ms)


def evaluate_candidate(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    before: VerificationResult,
    cand: RepairCandidate,
    target: Issue | None,
) -> tuple[CandidateEvaluation, VerificationResult | None, WorkflowIR | None]:
    t0 = time.perf_counter()
    if not cand.patches:
        return (
            CandidateEvaluation(
                candidate_id=cand.id,
                accepted=False,
                reject_reason="empty patch list",
                stages=skip_rest([_stage("patch_schema", "FAIL", "empty patch list", (time.perf_counter() - t0) * 1000)], 1, "not reached"),
            ),
            None,
            None,
        )
    stages = [_stage("patch_schema", "PASS", "ok", (time.perf_counter() - t0) * 1000)]
    t1 = time.perf_counter()
    ok, reason = validate_patches(ir, cand.patches)
    ms = (time.perf_counter() - t1) * 1000
    if not ok:
        if "whitelist" in reason or "tool" in reason:
            stages.append(_stage("graph_integrity", "PASS", "pre-policy"))
            stages.append(_stage("policy_whitelist", "FAIL", reason, ms))
            stages = skip_rest(stages, 3, "not reached")
        else:
            stages.append(_stage("graph_integrity", "FAIL", reason, ms))
            stages = skip_rest(stages, 2, "not reached")
        return CandidateEvaluation(candidate_id=cand.id, accepted=False, reject_reason=reason, stages=stages), None, None
    allowed = DOMAIN_TOOLS.get(ir.domain, ())
    policy_hit = any(
        (p.tool or (p.node or {}).get("tool")) and (p.kind == "tool" or (p.node or {}).get("kind") == "tool")
        and (p.tool or (p.node or {}).get("tool")) not in allowed
        for p in cand.patches
    )
    stages.append(_stage("graph_integrity", "PASS", "ok"))
    stages.append(_stage("policy_whitelist", "FAIL" if policy_hit else "PASS", "ok" if not policy_hit else "forbidden tool"))
    if policy_hit:
        stages = skip_rest(stages, 3, "not reached")
        return CandidateEvaluation(candidate_id=cand.id, accepted=False, reject_reason="forbidden tool", stages=stages), None, None
    nxt = apply_patches(ir, cand.patches)
    t2 = time.perf_counter()
    screened = incremental_verify(ir, nxt, spec, previous=before)
    inc_ms = (time.perf_counter() - t2) * 1000
    if not _promising(before, screened.result, target):
        stages.append(_stage("incremental_screening", "FAIL", "not promising", inc_ms))
        stages = skip_rest(stages, 4, "not reached")
        return CandidateEvaluation(candidate_id=cand.id, accepted=False, reject_reason="REPAIR_REJECTED_NO_IMPROVEMENT", stages=stages), None, None
    stages.append(_stage("incremental_screening", "PASS", "ok", inc_ms))
    t3 = time.perf_counter()
    after = verify_workflow(nxt, spec)
    full_ms = (time.perf_counter() - t3) * 1000
    stages.append(_stage("full_verification", "PASS", after.status, full_ms))
    decision = accept_candidate(before, after, target)
    stages.append(_stage("regression_decision", "PASS" if decision == "REPAIR_ACCEPTED" else "FAIL", decision, 0))
    return (
        CandidateEvaluation(
            candidate_id=cand.id,
            accepted=decision == "REPAIR_ACCEPTED",
            reject_reason=None if decision == "REPAIR_ACCEPTED" else decision,
            stages=stages,
        ),
        after,
        nxt if decision == "REPAIR_ACCEPTED" else ir,
    )


def pick_plan(
    ir: WorkflowIR,
    spec: WorkflowSpec,
    before: VerificationResult,
    k: int = 3,
    allow_ai: bool = True,
) -> tuple[list[Patch] | None, VerificationResult | None, WorkflowIR | None, str, PickStats]:
    target = before.issues[0] if before.issues else None
    candidates, ai_trace = plan_candidates(ir, before.issues, k=k, spec=spec, allow_ai=allow_ai)
    stats = PickStats(generated=len(candidates), candidates=candidates, ai_trace=ai_trace)
    ranked: list[tuple[tuple, RepairCandidate, VerificationResult, WorkflowIR, CandidateEvaluation]] = []
    for cand in candidates:
        evaluation, after, nxt = evaluate_candidate(ir, spec, before, cand, target)
        stats.evaluations.append(evaluation)
        failed = next((item for item in evaluation.stages if item.status == "FAIL"), None)
        if failed and failed.name in {"patch_schema", "graph_integrity", "policy_whitelist"}:
            stats.rejected_guard += 1
            continue
        if failed and failed.name == "incremental_screening":
            stats.rejected_incremental += 1
            continue
        if after is None or failed:
            continue
        stats.fully_verified += 1
        ranked.append((lex_key(before, after, target, cand.patches, ir, nxt or ir), cand, after, nxt or ir, evaluation))
    if not ranked:
        decision = "REPAIR_REJECTED_INVALID_PATCH" if stats.rejected_guard == stats.generated else "REPAIR_REJECTED_NO_IMPROVEMENT"
        stats.selected = decision
        return None, None, None, decision, stats
    ranked.sort(key=lambda item: item[0])
    _key, cand, after, nxt, evaluation = ranked[0]
    decision = "REPAIR_ACCEPTED" if evaluation.accepted else (evaluation.reject_reason or "REPAIR_REJECTED_NO_IMPROVEMENT")
    stats.selected = decision
    stats.selected_candidate_id = cand.id
    if decision != "REPAIR_ACCEPTED":
        return cand.patches, after, ir, decision, stats
    return cand.patches, after, nxt, decision, stats
