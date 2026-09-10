from __future__ import annotations

from veriflow_ir.graph import fresh_id, incoming, outgoing
from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.patch import Patch
from veriflow_verify.issue import Issue

BOUNDS_EXPR = "spec.n_min >= 1 && spec.n_max <= 100000"


def plan_patches(ir: WorkflowIR, issues: list[Issue]) -> list[Patch]:
    rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    ordered = sorted(issues, key=lambda item: rank[item.severity])
    for issue in ordered:
        batch = _for_issue(ir, issue, [])
        if batch:
            return batch
    return []


def _for_issue(ir: WorkflowIR, issue: Issue, existing: list[Patch]) -> list[Patch]:
    if issue.code == "MISSING_HUMAN_GATE":
        return _insert_gate(ir)
    if issue.code in {"WEAK_BOUNDS", "MISSING_REQUIRED_ACTION"} and (
        "guard" in (issue.requirement or "")
        or issue.code == "WEAK_BOUNDS"
        or "守卫" in (issue.description or "")
        or issue.constraint_id == "act_guard"
    ):
        if any(node.kind == "guard" for node in ir.nodes):
            guard = next(node for node in ir.nodes if node.kind == "guard")
            return [
                Patch(
                    operation="update_condition",
                    node_id=guard.id,
                    expr=BOUNDS_EXPR,
                    reason="fix bounds expr",
                )
            ]
        return _insert_guard(ir)
    if issue.code == "MISSING_REQUIRED_ACTION" and "human_gate" in issue.description:
        return _insert_gate(ir)
    if issue.code == "GUARD_NOT_EXPR" and issue.affected_nodes:
        return [
            Patch(
                operation="update_condition",
                node_id=issue.affected_nodes[0],
                expr=BOUNDS_EXPR,
                reason="replace natural language guard",
            )
        ]
    if issue.code == "HARDCODED_SECRET" and issue.affected_nodes:
        return [
            Patch(
                operation="update_node_parameter",
                node_id=issue.affected_nodes[0],
                key=issue.actual,
                value=None,
                reason="strip secret",
            )
        ]
    if issue.code == "DEAD_NODE" and issue.affected_nodes:
        node_id = issue.affected_nodes[0]
        node = ir.node_map().get(node_id)
        if node and node.kind == "transform" and not outgoing(ir).get(node_id):
            return [Patch(operation="remove_node", node_id=node_id, reason="drop orphan")]
    if issue.code == "ORDER_VIOLATION":
        if "human_gate" in (issue.expected or "") and not any(node.kind == "human_gate" for node in ir.nodes):
            return _insert_gate(ir)
        if "guard" in (issue.expected or "") and not any(node.kind == "guard" for node in ir.nodes):
            return _insert_guard(ir)
        return []
    del existing
    return []


def _insert_gate(ir: WorkflowIR) -> list[Patch]:
    pubs = [node.id for node in ir.nodes if node.kind == "tool" and node.tool == "publish_problem"]
    if not pubs:
        return []
    pub = pubs[0]
    gate_id = fresh_id(ir, "review")
    preds = incoming(ir).get(pub, [])
    patches = [
        Patch(
            operation="add_node",
            node_id=gate_id,
            kind="human_gate",
            node={"id": gate_id, "kind": "human_gate", "assignee_role": "problemsetter", "on_fail": "reject"},
            reason="insert human_gate before publish",
        )
    ]
    if not preds:
        src = ir.nodes[0].id if ir.nodes else None
        if src and src != pub:
            patches.append(Patch(operation="connect_nodes", source=src, target=gate_id))
    for pred in preds:
        patches.append(Patch(operation="disconnect_nodes", source=pred, target=pub))
        patches.append(Patch(operation="connect_nodes", source=pred, target=gate_id))
    patches.append(Patch(operation="connect_nodes", source=gate_id, target=pub))
    return patches


def _insert_guard(ir: WorkflowIR) -> list[Patch]:
    gens = [node.id for node in ir.nodes if node.kind == "tool" and node.tool == "test_generator"]
    if not gens:
        return []
    gen = gens[0]
    guard_id = fresh_id(ir, "g_bounds")
    succs = outgoing(ir).get(gen, [])
    patches = [
        Patch(
            operation="add_node",
            node_id=guard_id,
            kind="guard",
            expr=BOUNDS_EXPR,
            node={
                "id": guard_id,
                "kind": "guard",
                "expr": BOUNDS_EXPR,
                "on_fail": "reject",
            },
            reason="insert bounds guard",
        )
    ]
    for succ in succs:
        patches.append(Patch(operation="disconnect_nodes", source=gen, target=succ))
        patches.append(Patch(operation="connect_nodes", source=guard_id, target=succ))
    patches.append(Patch(operation="connect_nodes", source=gen, target=guard_id))
    if not succs:
        pubs = [node.id for node in ir.nodes if node.tool == "publish_problem"]
        if pubs:
            patches.append(Patch(operation="connect_nodes", source=guard_id, target=pubs[0]))
    return patches
