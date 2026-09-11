from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.ambiguity import AmbiguityReport
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import VerificationResult


class ClauseCoverage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    text: str
    kind: str
    status: str
    constraint_id: str = ""
    nodes: list[str] = Field(default_factory=list)
    verifier: str = ""
    evidence: str = ""
    snippet: str = ""


class Traceability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clauses: list[ClauseCoverage] = Field(default_factory=list)
    covered: int = 0
    failed: int = 0
    ambiguous: int = 0
    unmapped: int = 0


def build_traceability(
    spec: WorkflowSpec,
    ir: WorkflowIR,
    static: VerificationResult,
    runtime_findings: list[dict] | None = None,
    ambiguity: AmbiguityReport | None = None,
) -> Traceability:
    by_id = {item.constraint_id: item for item in static.constraints}
    traces = {item.constraint_id: item for item in spec.source_traces}
    clauses: list[ClauseCoverage] = []

    def add(cid: str, text: str, kind: str, nodes: list[str] | None = None, verifier: str = "") -> None:
        verdict = by_id.get(cid)
        status = "UNMAPPED"
        evidence = ""
        linked_nodes = list(nodes or [])
        method = verifier
        if verdict:
            status = "COVERED" if verdict.status == "PASS" else "FAILED" if verdict.status == "FAIL" else "UNMAPPED"
            evidence = (verdict.evidence[0] if verdict.evidence else verdict.description) or ""
            linked_nodes = verdict.affected_nodes or linked_nodes
            method = str(verdict.verification_method or method)
        snippet = traces[cid].snippet if cid in traces else ""
        clauses.append(
            ClauseCoverage(
                id=cid,
                text=text or cid,
                kind=kind,
                status=status,
                constraint_id=cid,
                nodes=linked_nodes,
                verifier=method,
                evidence=evidence,
                snippet=snippet,
            )
        )

    for action in spec.required_actions:
        nodes = [node.id for node in ir.nodes if node.kind == action.kind and (not action.tool or node.tool == action.tool)]
        add(action.id, action.requirement, "action", nodes, "semantic")
    for item in spec.ordering_constraints:
        add(item.id, item.requirement, "ordering", [], "semantic")
    for item in spec.temporal_constraints:
        add(item.id, item.requirement or f"{item.kind} {item.a}", "temporal", [item.a] + ([item.b] if item.b else []), "runtime")
    for item in spec.safety_policies:
        add(item.id, item.requirement, "safety", [], "safety")
    for item in spec.data_dependencies:
        add(item.id, item.requirement, "dataflow", [item.producer, item.consumer], "dataflow")

    runtime_findings = runtime_findings or []
    failed_runtime = {item.get("code") for item in runtime_findings if isinstance(item, dict)}
    for clause in clauses:
        if clause.kind == "temporal" and clause.constraint_id in failed_runtime:
            clause.status = "FAILED"
            clause.verifier = "runtime.temporal"

    if ambiguity:
        for item in ambiguity.items:
            clauses.append(
                ClauseCoverage(
                    id=item.ambiguity_id,
                    text=item.reason,
                    kind="ambiguity",
                    status="AMBIGUOUS",
                    snippet=item.snippet,
                    evidence=item.suggested_clarification,
                    verifier="spec.ambiguity",
                )
            )

    covered = sum(1 for item in clauses if item.status == "COVERED")
    failed = sum(1 for item in clauses if item.status == "FAILED")
    ambiguous = sum(1 for item in clauses if item.status == "AMBIGUOUS")
    unmapped = sum(1 for item in clauses if item.status == "UNMAPPED")
    return Traceability(
        clauses=clauses,
        covered=covered,
        failed=failed,
        ambiguous=ambiguous,
        unmapped=unmapped,
    )
