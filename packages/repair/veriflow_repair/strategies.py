"""Deterministic repair strategies. Planner asks the registry before any LLM path."""

from __future__ import annotations

from veriflow_ir.graph import fresh_id, incoming, outgoing
from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.patch import Patch
from veriflow_verify.issue import Issue

BOUNDS_EXPR = "spec.n_min >= 1 && spec.n_max <= 100000"


def _pub(ir: WorkflowIR) -> str | None:
    for node in ir.nodes:
        if node.kind == "tool" and node.tool == "publish_problem":
            return node.id
    return None


def _first(ir: WorkflowIR, kind: str | None = None, tool: str | None = None) -> str | None:
    for node in ir.nodes:
        if kind and node.kind == kind:
            return node.id
        if tool and node.tool == tool:
            return node.id
    return None


def restore_spine(ir: WorkflowIR) -> list[Patch]:
    """gen → guard → human_gate → pub. Minimal reconnect for compose graphs."""
    gen = _first(ir, tool="test_generator")
    guard = _first(ir, kind="guard")
    gate = _first(ir, kind="human_gate")
    pub = _pub(ir)
    chain = [item for item in (gen, guard, gate, pub) if item]
    if len(chain) < 2:
        return []
    patches: list[Patch] = []
    have = {(e.from_, e.to) for e in ir.edges}
    for src, dst in zip(chain, chain[1:]):
        if (src, dst) in have:
            continue
        reverse = (dst, src) in have
        if reverse:
            patches.append(Patch(operation="disconnect_nodes", source=dst, target=src, reason="undo reversed edge"))
            have.discard((dst, src))
        patches.append(Patch(operation="connect_nodes", source=src, target=dst, reason="restore compose spine"))
        have.add((src, dst))
    if gen and pub and gate and (gen, pub) in have:
        patches.append(Patch(operation="disconnect_nodes", source=gen, target=pub, reason="remove skip-gate shortcut"))
        have.discard((gen, pub))
    if guard and pub and gate and (guard, pub) in have:
        patches.append(Patch(operation="disconnect_nodes", source=guard, target=pub, reason="remove skip-gate shortcut"))
    return patches


def insert_gate(ir: WorkflowIR) -> list[Patch]:
    pub = _pub(ir)
    if not pub:
        return []
    if _first(ir, kind="human_gate"):
        return restore_spine(ir)
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


def insert_guard(ir: WorkflowIR) -> list[Patch]:
    if _first(ir, kind="guard"):
        return []
    gen = _first(ir, tool="test_generator")
    if not gen:
        return []
    guard_id = fresh_id(ir, "g_bounds")
    succs = outgoing(ir).get(gen, [])
    patches = [
        Patch(
            operation="add_node",
            node_id=guard_id,
            kind="guard",
            expr=BOUNDS_EXPR,
            node={"id": guard_id, "kind": "guard", "expr": BOUNDS_EXPR, "on_fail": "reject"},
            reason="insert bounds guard",
        )
    ]
    for succ in succs:
        patches.append(Patch(operation="disconnect_nodes", source=gen, target=succ))
        patches.append(Patch(operation="connect_nodes", source=guard_id, target=succ))
    patches.append(Patch(operation="connect_nodes", source=gen, target=guard_id))
    if not succs:
        nxt = _first(ir, kind="human_gate") or _pub(ir)
        if nxt:
            patches.append(Patch(operation="connect_nodes", source=guard_id, target=nxt))
    return patches


def plan_for_issue(ir: WorkflowIR, issue: Issue) -> tuple[list[Patch], str]:
    """Return (patches, strategy_id). Empty patches means unsupported."""
    if issue.code == "MISSING_HUMAN_GATE":
        return insert_gate(ir), "insert_human_gate"
    if issue.code == "GUARD_NOT_EXPR" and issue.affected_nodes:
        return (
            [Patch(operation="update_condition", node_id=issue.affected_nodes[0], expr=BOUNDS_EXPR, reason="replace NL guard")],
            "fix_guard_expr",
        )
    if issue.code == "WEAK_BOUNDS":
        if _first(ir, kind="guard"):
            guard = _first(ir, kind="guard")
            return (
                [Patch(operation="update_condition", node_id=guard, expr=BOUNDS_EXPR, reason="fix bounds expr")],
                "fix_guard_expr",
            )
        return insert_guard(ir), "insert_bounds_guard"
    if issue.code == "MISSING_REQUIRED_ACTION":
        desc = (issue.description or "") + (issue.requirement or "")
        if "human_gate" in desc or "审题" in desc:
            return insert_gate(ir), "insert_human_gate"
        if "guard" in desc or "守卫" in desc:
            return insert_guard(ir), "insert_bounds_guard"
        return restore_spine(ir), "restore_spine"
    if issue.code == "HARDCODED_SECRET" and issue.affected_nodes:
        return (
            [
                Patch(
                    operation="update_node_parameter",
                    node_id=issue.affected_nodes[0],
                    key=issue.actual,
                    value=None,
                    reason="strip secret",
                )
            ],
            "strip_secret",
        )
    if issue.code == "UNRESTRICTED_WEBHOOK" and issue.affected_nodes:
        return (
            [
                Patch(
                    operation="update_node_parameter",
                    node_id=issue.affected_nodes[0],
                    key="url",
                    value="",
                    reason="drop unrestricted URL",
                )
            ],
            "strip_webhook",
        )
    if issue.code == "DEAD_NODE" and issue.affected_nodes:
        node_id = issue.affected_nodes[0]
        node = ir.node_map().get(node_id)
        if node and node.kind == "transform" and not outgoing(ir).get(node_id) and not incoming(ir).get(node_id):
            return [Patch(operation="remove_node", node_id=node_id, reason="drop orphan")], "drop_orphan"
        return restore_spine(ir), "restore_spine"
    if issue.code in {"ORDER_VIOLATION", "BROKEN_BINDING"}:
        return restore_spine(ir), "restore_spine"
    return [], "unsupported"
