from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR


def graph_diff(before: WorkflowIR, after: WorkflowIR) -> dict[str, int]:
    b_nodes = {node.id: node.model_dump() for node in before.nodes}
    a_nodes = {node.id: node.model_dump() for node in after.nodes}
    b_edges = {(edge.from_, edge.to) for edge in before.edges}
    a_edges = {(edge.from_, edge.to) for edge in after.edges}
    changed_nodes = set(b_nodes) ^ set(a_nodes)
    for nid in set(b_nodes) & set(a_nodes):
        if b_nodes[nid] != a_nodes[nid]:
            changed_nodes.add(nid)
    param_changes = 0
    for nid in set(b_nodes) & set(a_nodes):
        if b_nodes[nid].get("config") != a_nodes[nid].get("config") or b_nodes[nid].get("expr") != a_nodes[nid].get(
            "expr"
        ):
            param_changes += 1
    return {
        "changed_nodes": len(changed_nodes),
        "changed_edges": len(b_edges ^ a_edges),
        "changed_parameters": param_changes,
    }
