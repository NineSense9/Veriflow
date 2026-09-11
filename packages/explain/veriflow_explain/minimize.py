"""Minimized counterexample (approximate). Not a claim of global minimality."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.workflow import WorkflowIR
from veriflow_verify.issue import Issue


class MinimizedCounterexample(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issue_id: str
    original_node_count: int
    minimized_nodes: list[str] = Field(default_factory=list)
    minimized_edges: list[str] = Field(default_factory=list)
    witness_path: list[str] = Field(default_factory=list)
    constraint_ids: list[str] = Field(default_factory=list)
    method: str = "witness-slice"
    globally_minimal: bool = False
    algorithm_id: str = "counterexample.minimize"
    algorithm_version: str = "1.0"


def minimize_issue(ir: WorkflowIR, issue: Issue) -> MinimizedCounterexample:
    keep: list[str] = []
    for nid in issue.witness_path:
        if nid not in keep:
            keep.append(nid)
    for nid in issue.affected_nodes:
        if nid not in keep:
            keep.append(nid)
    if not keep and ir.nodes:
        keep = [ir.nodes[0].id]
    known = {node.id for node in ir.nodes}
    keep = [nid for nid in keep if nid in known]
    # One-pass drop: remove nodes that are neither endpoints nor on the witness interior
    # if witness has ≥2 nodes. This is delta-debugging inspired, not exhaustive.
    if len(issue.witness_path) >= 2:
        ends = {issue.witness_path[0], issue.witness_path[-1]}
        interior = [nid for nid in keep if nid in issue.witness_path]
        keep = []
        for nid in interior:
            if nid in ends or nid in issue.affected_nodes:
                keep.append(nid)
            elif nid in issue.witness_path:
                keep.append(nid)
        # Prefer endpoints + affected; if that is non-empty, drop unused interior later
        core = []
        for nid in issue.witness_path:
            if nid in ends or nid in set(issue.affected_nodes):
                if nid not in core:
                    core.append(nid)
        if len(core) >= 2:
            keep = core
        elif issue.witness_path:
            keep = list(dict.fromkeys(issue.witness_path))
    edges = []
    keep_set = set(keep)
    for edge in ir.edges:
        if edge.from_ in keep_set and edge.to in keep_set:
            edges.append(f"{edge.from_}->{edge.to}")
    if issue.affected_edges:
        for item in issue.affected_edges:
            if item not in edges:
                edges.append(item)
    return MinimizedCounterexample(
        issue_id=issue.id,
        original_node_count=len(ir.nodes),
        minimized_nodes=keep,
        minimized_edges=edges,
        witness_path=issue.witness_path or keep,
        constraint_ids=[issue.constraint_id] if issue.constraint_id else [],
        method="witness-slice+endpoint-reduction",
        globally_minimal=False,
    )
