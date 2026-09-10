from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.executor import apply_patches
from veriflow_repair.patch import Patch
from veriflow_staticcheck.whitelist import DOMAIN_TOOLS


def validate_preconditions(ir: WorkflowIR, patches: list[Patch]) -> tuple[bool, str]:
    if not patches:
        return False, "empty patch list"
    ids = {node.id for node in ir.nodes}
    edges = {(edge.from_, edge.to) for edge in ir.edges}
    allowed = DOMAIN_TOOLS[ir.domain]
    pending_ids = set(ids)
    pending_edges = set(edges)
    for patch in patches:
        if patch.operation == "add_node":
            nid = patch.node_id or (patch.node or {}).get("id")
            if not nid:
                return False, "add_node missing id"
            if nid in pending_ids:
                return False, f"node {nid} already exists"
            tool = patch.tool or (patch.node or {}).get("tool")
            if patch.kind == "tool" and tool and tool not in allowed:
                return False, f"tool {tool} not in whitelist"
            pending_ids.add(nid)
        elif patch.operation == "remove_node":
            if patch.node_id not in pending_ids:
                return False, f"remove missing node {patch.node_id}"
            pending_ids.discard(patch.node_id)
        elif patch.operation == "connect_nodes":
            if patch.source not in pending_ids or patch.target not in pending_ids:
                return False, "connect endpoints missing"
            if (patch.source, patch.target) in pending_edges:
                return False, "edge already exists"
            pending_edges.add((patch.source, patch.target))
        elif patch.operation == "disconnect_nodes":
            if (patch.source, patch.target) not in pending_edges:
                return False, "disconnect missing edge"
            pending_edges.discard((patch.source, patch.target))
        elif patch.operation in {"update_condition", "update_node_parameter", "replace_node_operation"}:
            if patch.node_id not in pending_ids:
                return False, f"update missing node {patch.node_id}"
            if patch.operation == "replace_node_operation" and patch.tool and patch.tool not in allowed:
                return False, f"tool {patch.tool} not in whitelist"
    return True, "ok"


def validate_postconditions(before: WorkflowIR, after: WorkflowIR, patches: list[Patch]) -> tuple[bool, str]:
    after_ids = {node.id for node in after.nodes}
    after_edges = {(edge.from_, edge.to) for edge in after.edges}
    for patch in patches:
        if patch.operation == "connect_nodes" and (patch.source, patch.target) not in after_edges:
            return False, "post: edge not created"
        if patch.operation == "disconnect_nodes" and (patch.source, patch.target) in after_edges:
            return False, "post: edge still present"
        if patch.operation == "add_node":
            nid = patch.node_id or (patch.node or {}).get("id")
            if nid not in after_ids:
                return False, "post: node not added"
        if patch.operation == "remove_node" and patch.node_id in after_ids:
            return False, "post: node still present"
    del before
    return True, "ok"


def validate_patches(ir: WorkflowIR, patches: list[Patch]) -> tuple[bool, str]:
    ok, reason = validate_preconditions(ir, patches)
    if not ok:
        return ok, reason
    try:
        after = apply_patches(ir, patches)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
    return validate_postconditions(ir, after, patches)
