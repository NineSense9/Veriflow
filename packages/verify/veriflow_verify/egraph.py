"""Evidence graph: entities + relations for one verification run. Not an ontology toy."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.graph import match_nodes
from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.models import ConformanceResult, ExecutionTrace
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import VerificationResult

RELATIONS = (
    "DERIVED_FROM",
    "SATISFIES",
    "VIOLATES",
    "CHECKS",
    "DEPENDS_ON",
    "OBSERVED_AS",
    "CAUSED_BY",
    "EXPLAINED_BY",
    "REPAIRED_BY",
    "VERIFIED_BY",
)


class Entity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: str
    label: str
    metadata: dict = Field(default_factory=dict)
    source: str = ""
    version: str = "1.0"


class Relation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str
    target_id: str
    relation_type: str
    evidence: str = ""
    run_id: str = ""


class EvidenceGraph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    created_at: str
    entities: list[Entity] = Field(default_factory=list)
    relations: list[Relation] = Field(default_factory=list)

    def neighborhood(self, root_id: str, hops: int = 2) -> "EvidenceGraph":
        keep = {root_id}
        frontier = {root_id}
        for _ in range(max(hops, 0)):
            nxt: set[str] = set()
            for rel in self.relations:
                if rel.source_id in frontier:
                    nxt.add(rel.target_id)
                if rel.target_id in frontier:
                    nxt.add(rel.source_id)
            frontier = nxt - keep
            keep |= nxt
        entities = [item for item in self.entities if item.id in keep]
        relations = [
            rel
            for rel in self.relations
            if rel.source_id in keep and rel.target_id in keep
        ]
        return EvidenceGraph(run_id=self.run_id, created_at=self.created_at, entities=entities, relations=relations)

    def why(self, issue_id: str) -> list[dict]:
        """Requirement → constraint → algorithm → nodes → evidence → verdict."""
        chain: list[dict] = []
        issue = next((item for item in self.entities if item.id == issue_id), None)
        if issue is None:
            return chain
        chain.append({"step": "verdict", "entity": issue.model_dump()})
        for rel in self.relations:
            if rel.relation_type == "VIOLATES" and rel.source_id == issue_id:
                target = next((item for item in self.entities if item.id == rel.target_id), None)
                if target:
                    chain.append({"step": "constraint", "entity": target.model_dump(), "via": rel.relation_type})
            if rel.relation_type == "CAUSED_BY" and rel.source_id == issue_id:
                target = next((item for item in self.entities if item.id == rel.target_id), None)
                if target:
                    chain.append({"step": "node", "entity": target.model_dump(), "via": rel.relation_type})
            if rel.relation_type == "EXPLAINED_BY" and rel.target_id == issue_id:
                source = next((item for item in self.entities if item.id == rel.source_id), None)
                if source:
                    chain.append({"step": "counterexample", "entity": source.model_dump(), "via": rel.relation_type})
        constraint_ids = {item["entity"]["id"] for item in chain if item["step"] == "constraint"}
        for rel in self.relations:
            if rel.relation_type == "DERIVED_FROM" and rel.source_id in constraint_ids:
                req = next((item for item in self.entities if item.id == rel.target_id), None)
                if req:
                    chain.append({"step": "requirement", "entity": req.model_dump(), "via": rel.relation_type})
            if rel.relation_type == "CHECKS" and rel.source_id in constraint_ids:
                algo = next((item for item in self.entities if item.id == rel.target_id and item.type == "Algorithm"), None)
                if algo:
                    chain.append({"step": "algorithm", "entity": algo.model_dump(), "via": rel.relation_type})
        order = ["requirement", "constraint", "algorithm", "node", "counterexample", "verdict"]
        chain.sort(key=lambda item: order.index(item["step"]) if item["step"] in order else 9)
        return chain


def build_graph(
    *,
    run_id: str,
    spec: WorkflowSpec,
    ir: WorkflowIR,
    static: VerificationResult,
    runtime: ConformanceResult | None = None,
    trace: ExecutionTrace | None = None,
) -> EvidenceGraph:
    entities: list[Entity] = []
    relations: list[Relation] = []
    now = datetime.now(timezone.utc).isoformat()

    def add(entity: Entity) -> None:
        entities.append(entity)

    def rel(src: str, dst: str, kind: str, evidence: str = "") -> None:
        relations.append(Relation(source_id=src, target_id=dst, relation_type=kind, evidence=evidence, run_id=run_id))

    req_id = "req:nl"
    add(
        Entity(
            id=req_id,
            type="Requirement",
            label=(spec.source_nl or spec.goal)[:80] or "(empty)",
            metadata={"compiler": spec.compiler, "basis": spec.compiler_basis},
            source="nl",
        )
    )
    run_ent = f"run:{run_id}"
    add(Entity(id=run_ent, type="VerificationRun", label=run_id, metadata={"status": static.status}))

    traces = {item.constraint_id: item for item in spec.source_traces}
    constraints: list[tuple[str, str, str]] = []
    for item in spec.required_actions:
        constraints.append((item.id, item.requirement or item.kind, "CARDINALITY"))
    for item in spec.ordering_constraints:
        constraints.append((item.id, item.requirement, "ORDERING"))
    for item in spec.data_dependencies:
        constraints.append((item.id, item.requirement, "DATA_DEPENDENCY"))
    for item in spec.safety_policies:
        constraints.append((item.id, item.requirement or item.kind, "SAFETY"))
    for item in spec.temporal_constraints:
        constraints.append((item.id, item.requirement or item.kind, "TEMPORAL"))

    for cid, label, ctype in constraints:
        eid = f"constraint:{cid}"
        trace_hit = traces.get(cid)
        add(
            Entity(
                id=eid,
                type="Constraint",
                label=label or cid,
                metadata={
                    "type": ctype,
                    "source_kind": trace_hit.kind if trace_hit else "platform_policy",
                    "source_start": trace_hit.start if trace_hit else None,
                    "source_end": trace_hit.end if trace_hit else None,
                    "snippet": trace_hit.snippet if trace_hit else "",
                },
                source="spec",
            )
        )
        rel(eid, req_id, "DERIVED_FROM", trace_hit.kind if trace_hit else "platform_policy")

    for node in ir.nodes:
        add(Entity(id=f"node:{node.id}", type="WorkflowNode", label=node.tool or node.kind, metadata={"kind": node.kind}))
    for edge in ir.edges:
        eid = f"edge:{edge.from_}->{edge.to}"
        add(Entity(id=eid, type="WorkflowEdge", label=f"{edge.from_}→{edge.to}"))
        rel(eid, f"node:{edge.from_}", "DEPENDS_ON")
        rel(eid, f"node:{edge.to}", "DEPENDS_ON")

    for cid, _label, ctype in constraints:
        selector = cid
        item = next((a for a in spec.required_actions if a.id == cid), None)
        if item:
            selector = item.tool or item.kind
        matched = match_nodes(ir, selector)
        for node in matched:
            rel(f"constraint:{cid}", f"node:{node.id}", "CHECKS")

    algo_ids = {issue.detected_by or "graph.integrity" for issue in static.issues}
    for algo in sorted(algo_ids | {"graph.integrity", "runtime.temporal"}):
        add(Entity(id=f"algo:{algo}", type="Algorithm", label=algo, source="registry"))

    for issue in static.issues:
        iid = f"issue:{issue.id}"
        add(
            Entity(
                id=iid,
                type="Issue",
                label=issue.code,
                metadata={"severity": issue.severity, "verdict": issue.verdict, "detected_by": issue.detected_by},
            )
        )
        if issue.constraint_id:
            rel(iid, f"constraint:{issue.constraint_id}", "VIOLATES", issue.code)
        for nid in issue.affected_nodes:
            rel(iid, f"node:{nid}", "CAUSED_BY")
        if issue.detected_by:
            rel(f"constraint:{issue.constraint_id or issue.id}", f"algo:{issue.detected_by}", "CHECKS")
        cex = f"cex:{issue.id}"
        add(
            Entity(
                id=cex,
                type="Counterexample",
                label=" → ".join(issue.witness_path) or issue.actual or issue.code,
                metadata={"minimized": issue.minimized_nodes},
            )
        )
        rel(cex, iid, "EXPLAINED_BY")
        rel(iid, run_ent, "VERIFIED_BY")

    if trace:
        for event in trace.events:
            eid = f"event:{event.event_index}"
            add(
                Entity(
                    id=eid,
                    type="RuntimeEvent",
                    label=f"{event.operation}:{event.status}",
                    metadata={"branch": event.branch, "index": event.event_index},
                )
            )
            rel(eid, f"node:{event.node_id}", "OBSERVED_AS")
    if runtime:
        for item in runtime.issues:
            if item.status != "FAIL":
                continue
            iid = f"issue:rt:{item.constraint_id}"
            add(
                Entity(
                    id=iid,
                    type="Issue",
                    label=item.constraint_id,
                    metadata={"verdict": "FAIL", "detected_by": "runtime.temporal"},
                )
            )
            rel(iid, f"constraint:{item.constraint_id}", "VIOLATES", item.observed)
            rel(iid, run_ent, "VERIFIED_BY")
            rel(f"constraint:{item.constraint_id}", "algo:runtime.temporal", "CHECKS")
            for nid in item.affected_nodes:
                if any(node.id == nid or node.kind == nid or node.tool == nid for node in ir.nodes):
                    for node in ir.nodes:
                        if nid in {node.id, node.kind, node.tool}:
                            rel(iid, f"node:{node.id}", "CAUSED_BY")

    rel(run_ent, req_id, "VERIFIED_BY")
    return EvidenceGraph(run_id=run_id, created_at=now, entities=entities, relations=relations)
