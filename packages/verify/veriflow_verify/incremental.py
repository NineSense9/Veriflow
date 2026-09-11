from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.graph import outgoing, sources
from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import VerificationResult, verify_scoped, verify_workflow

ALL_VERIFIERS = {"structural", "semantic", "dataflow", "executable", "safety"}


class WorkflowChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    node_id: str | None = None
    edge: str | None = None
    field: str | None = None


class ImpactSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    affected_nodes: list[str] = Field(default_factory=list)
    affected_constraints: list[str] = Field(default_factory=list)
    affected_verifiers: list[str] = Field(default_factory=list)
    reason: str = ""


class IncrementalResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    result: VerificationResult
    impact: ImpactSet
    reevaluated_constraints: int = 0
    total_constraints: int = 0
    used_full_fallback: bool = False
    changes: list[WorkflowChange] = Field(default_factory=list)


class EquivalenceReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    equivalent: bool
    full_status: str
    incremental_status: str
    full_codes: list[str] = Field(default_factory=list)
    incremental_codes: list[str] = Field(default_factory=list)
    disagreements: list[str] = Field(default_factory=list)


def workflow_changes(before: WorkflowIR, after: WorkflowIR) -> list[WorkflowChange]:
    changes: list[WorkflowChange] = []
    b_nodes = {n.id: n for n in before.nodes}
    a_nodes = {n.id: n for n in after.nodes}
    b_sources = set(sources(before))
    a_sources = set(sources(after))
    for nid in sorted(set(a_nodes) - set(b_nodes)):
        changes.append(WorkflowChange(kind="NODE_ADDED", node_id=nid))
    for nid in sorted(set(b_nodes) - set(a_nodes)):
        changes.append(WorkflowChange(kind="NODE_REMOVED", node_id=nid))
    for nid in sorted(set(b_nodes) & set(a_nodes)):
        old, new = b_nodes[nid], a_nodes[nid]
        if old.kind != new.kind or old.tool != new.tool:
            changes.append(WorkflowChange(kind="NODE_TYPE_CHANGED", node_id=nid))
        if old.expr != new.expr:
            changes.append(WorkflowChange(kind="CONDITION_CHANGED", node_id=nid, field="expr"))
        if old.config != new.config:
            changes.append(WorkflowChange(kind="PARAMETER_CHANGED", node_id=nid, field="config"))
        if old.in_type != new.in_type or old.out_type != new.out_type:
            changes.append(WorkflowChange(kind="BINDING_CHANGED", node_id=nid, field="types"))
        if nid in a_sources and nid in b_sources and (old.kind != new.kind or old.tool != new.tool):
            changes.append(WorkflowChange(kind="TRIGGER_CHANGED", node_id=nid))
    b_edges = {(e.from_, e.to) for e in before.edges}
    a_edges = {(e.from_, e.to) for e in after.edges}
    for src, dst in sorted(a_edges - b_edges):
        changes.append(WorkflowChange(kind="EDGE_ADDED", edge=f"{src}->{dst}"))
    for src, dst in sorted(b_edges - a_edges):
        changes.append(WorkflowChange(kind="EDGE_REMOVED", edge=f"{src}->{dst}"))
    return changes


def _verifiers_for(changes: list[WorkflowChange]) -> set[str]:
    if not changes:
        return set()
    kinds = {item.kind for item in changes}
    if kinds & {"NODE_ADDED", "NODE_REMOVED", "NODE_TYPE_CHANGED", "TRIGGER_CHANGED"}:
        return set(ALL_VERIFIERS)
    run: set[str] = set()
    if kinds & {"EDGE_ADDED", "EDGE_REMOVED"}:
        # MISSING_HUMAN_GATE is classified as safety but comes from the graph.
        run |= {"structural", "semantic", "dataflow", "executable", "safety"}
    if "PARAMETER_CHANGED" in kinds:
        run.add("safety")
    if "CONDITION_CHANGED" in kinds:
        run |= {"structural", "semantic", "safety"}
    if "BINDING_CHANGED" in kinds:
        run |= {"dataflow", "semantic"}
    return run or set(ALL_VERIFIERS)


def impact_set(before: WorkflowIR, after: WorkflowIR, spec: WorkflowSpec) -> ImpactSet:
    changes = workflow_changes(before, after)
    nodes = {c.node_id for c in changes if c.node_id}
    for change in changes:
        if change.edge:
            nodes.update(change.edge.split("->"))
    down = set(nodes)
    adj = outgoing(after)
    stack = list(nodes)
    while stack:
        cur = stack.pop()
        for nxt in adj.get(cur, []):
            if nxt not in down:
                down.add(nxt)
                stack.append(nxt)
    constraint_ids: list[str] = []
    structural = any(
        c.kind in {"NODE_ADDED", "NODE_REMOVED", "EDGE_ADDED", "EDGE_REMOVED", "NODE_TYPE_CHANGED"}
        for c in changes
    )
    if structural:
        constraint_ids = [a.id for a in spec.required_actions] + [o.id for o in spec.ordering_constraints]
        constraint_ids.extend(item.id for item in spec.data_dependencies)
        constraint_ids.extend(item.id for item in spec.safety_policies)
    else:
        for item in spec.ordering_constraints:
            if item.before in down or item.after in down:
                constraint_ids.append(item.id)
        for item in spec.required_actions:
            constraint_ids.append(item.id)
        if any(c.kind == "PARAMETER_CHANGED" for c in changes):
            constraint_ids.extend(item.id for item in spec.safety_policies)
        for item in spec.data_dependencies:
            if item.producer in down or item.consumer in down:
                constraint_ids.append(item.id)
    verifiers = sorted(_verifiers_for(changes))
    return ImpactSet(
        affected_nodes=sorted(down),
        affected_constraints=sorted(set(constraint_ids)),
        affected_verifiers=verifiers,
        reason="structural change" if structural else "local parameter/condition change",
    )


def incremental_verify(
    before: WorkflowIR,
    after: WorkflowIR,
    spec: WorkflowSpec,
    previous: VerificationResult | None = None,
) -> IncrementalResult:
    changes = workflow_changes(before, after)
    impact = impact_set(before, after, spec)
    rerun = set(impact.affected_verifiers)
    if previous is None or rerun == ALL_VERIFIERS:
        full = verify_workflow(after, spec)
        return IncrementalResult(
            result=full,
            impact=impact,
            reevaluated_constraints=len(full.constraints),
            total_constraints=len(full.constraints),
            used_full_fallback=True,
            changes=changes,
        )
    if not changes or not rerun:
        return IncrementalResult(
            result=previous,
            impact=impact,
            reevaluated_constraints=0,
            total_constraints=len(previous.constraints),
            used_full_fallback=False,
            changes=changes,
        )
    scoped = verify_scoped(after, spec, previous, rerun)
    return IncrementalResult(
        result=scoped,
        impact=impact,
        reevaluated_constraints=len(impact.affected_constraints) or len(scoped.constraints),
        total_constraints=len(scoped.constraints),
        used_full_fallback=False,
        changes=changes,
    )


def equivalence(full: VerificationResult, incremental: VerificationResult) -> bool:
    return equivalence_report(full, incremental).equivalent


def equivalence_report(full: VerificationResult, incremental: VerificationResult) -> EquivalenceReport:
    full_codes = sorted(i.code for i in full.issues)
    inc_codes = sorted(i.code for i in incremental.issues)
    disagreements: list[str] = []
    if full.status != incremental.status:
        disagreements.append(f"status {full.status} vs {incremental.status}")
    if full_codes != inc_codes:
        disagreements.append(f"codes {full_codes} vs {inc_codes}")
    full_fail = sorted(c.constraint_id for c in full.constraints if c.status == "FAIL")
    inc_fail = sorted(c.constraint_id for c in incremental.constraints if c.status == "FAIL")
    if full_fail != inc_fail:
        disagreements.append(f"failed constraints {full_fail} vs {inc_fail}")
    return EquivalenceReport(
        equivalent=not disagreements,
        full_status=full.status,
        incremental_status=incremental.status,
        full_codes=full_codes,
        incremental_codes=inc_codes,
        disagreements=disagreements,
    )
