from __future__ import annotations

from collections import defaultdict, deque

from pydantic import BaseModel

from veriflow_ir.expr import GuardExprError, free_names, parse_guard
from veriflow_ir.workflow import Node, WorkflowIR
from veriflow_staticcheck.whitelist import (
    DEFAULT_BINDINGS,
    DOMAIN_TOOLS,
    TERMINAL_KINDS,
    TERMINAL_TOOLS,
)


class CheckError(BaseModel):
    code: str
    message: str
    node_id: str | None = None


def check_workflow(ir: WorkflowIR) -> list[CheckError]:
    errors: list[CheckError] = []
    nodes = ir.node_map()
    outgoing = defaultdict(list)
    incoming: dict[str, int] = {node_id: 0 for node_id in nodes}
    for edge in ir.edges:
        outgoing[edge.from_].append(edge.to)
        incoming[edge.to] = incoming.get(edge.to, 0) + 1

    errors.extend(_tool_whitelist(ir, nodes))
    errors.extend(_on_fail(nodes))
    errors.extend(_guards(nodes))
    errors.extend(_type_mismatch(ir, nodes))
    errors.extend(_dead_nodes(nodes, outgoing, incoming))
    errors.extend(_human_gate(nodes, outgoing))
    return errors


def _tool_whitelist(ir: WorkflowIR, nodes: dict[str, Node]) -> list[CheckError]:
    allowed = DOMAIN_TOOLS[ir.domain]
    errors: list[CheckError] = []
    for node in nodes.values():
        if node.kind != "tool":
            continue
        if not node.tool:
            errors.append(
                CheckError(
                    code="TOOL_NOT_ALLOWED",
                    message="tool node is missing tool name",
                    node_id=node.id,
                )
            )
        elif node.tool not in allowed:
            errors.append(
                CheckError(
                    code="TOOL_NOT_ALLOWED",
                    message=f"tool {node.tool!r} is not in {ir.domain} whitelist",
                    node_id=node.id,
                )
            )
    return errors


def _on_fail(nodes: dict[str, Node]) -> list[CheckError]:
    errors: list[CheckError] = []
    for node in nodes.values():
        if node.kind in {"guard", "human_gate"} and node.on_fail is None:
            errors.append(
                CheckError(
                    code="MISSING_ON_FAIL",
                    message=f"{node.kind} requires on_fail",
                    node_id=node.id,
                )
            )
    return errors


def _guards(nodes: dict[str, Node]) -> list[CheckError]:
    bindings = DEFAULT_BINDINGS | set(nodes)
    errors: list[CheckError] = []
    for node in nodes.values():
        if node.kind != "guard":
            continue
        if not node.expr:
            errors.append(
                CheckError(
                    code="GUARD_NOT_EXPR",
                    message="guard is missing expr",
                    node_id=node.id,
                )
            )
            continue
        try:
            parse_guard(node.expr)
        except GuardExprError as exc:
            errors.append(
                CheckError(code="GUARD_NOT_EXPR", message=str(exc), node_id=node.id)
            )
            continue
        unknown = free_names(node.expr) - bindings
        for name in sorted(unknown):
            errors.append(
                CheckError(
                    code="UNDEF_VAR",
                    message=f"undefined variable {name!r}",
                    node_id=node.id,
                )
            )
    return errors


def _type_mismatch(ir: WorkflowIR, nodes: dict[str, Node]) -> list[CheckError]:
    errors: list[CheckError] = []
    for edge in ir.edges:
        src = nodes[edge.from_]
        dst = nodes[edge.to]
        if src.out_type is None or dst.in_type is None:
            continue
        if src.out_type.type != dst.in_type.type:
            errors.append(
                CheckError(
                    code="TYPE_MISMATCH",
                    message=(
                        f"{edge.from_}:{src.out_type.type} -> "
                        f"{edge.to}:{dst.in_type.type}"
                    ),
                    node_id=edge.to,
                )
            )
    return errors


def _is_terminal(node: Node) -> bool:
    if node.kind in TERMINAL_KINDS:
        return True
    return node.kind == "tool" and node.tool in TERMINAL_TOOLS


def _dead_nodes(
    nodes: dict[str, Node],
    outgoing: dict[str, list[str]],
    incoming: dict[str, int],
) -> list[CheckError]:
    if not nodes:
        return []
    sources = [node_id for node_id, deg in incoming.items() if deg == 0]
    if not sources:
        sources = list(nodes)
    reachable: set[str] = set()
    queue = deque(sources)
    while queue:
        current = queue.popleft()
        if current in reachable:
            continue
        reachable.add(current)
        for nxt in outgoing.get(current, []):
            queue.append(nxt)
    errors: list[CheckError] = []
    for node_id, node in nodes.items():
        if node_id not in reachable:
            errors.append(
                CheckError(
                    code="DEAD_NODE",
                    message="node is not reachable from an entry",
                    node_id=node_id,
                )
            )
            continue
        if not outgoing.get(node_id) and not _is_terminal(node):
            errors.append(
                CheckError(
                    code="DEAD_NODE",
                    message="non-terminal node has no outgoing edge",
                    node_id=node_id,
                )
            )
    return errors


def _human_gate(
    nodes: dict[str, Node],
    outgoing: dict[str, list[str]],
) -> list[CheckError]:
    publishes = [
        node_id
        for node_id, node in nodes.items()
        if node.kind == "tool" and node.tool == "publish_problem"
    ]
    if not publishes:
        return []
    predecessors: dict[str, list[str]] = defaultdict(list)
    for src, dests in outgoing.items():
        for dest in dests:
            predecessors[dest].append(src)

    errors: list[CheckError] = []
    for pub in publishes:
        if not _has_human_gate_ancestor(pub, nodes, predecessors):
            errors.append(
                CheckError(
                    code="MISSING_HUMAN_GATE",
                    message="publish_problem requires a human_gate on every path",
                    node_id=pub,
                )
            )
    return errors


def _has_human_gate_ancestor(
    start: str,
    nodes: dict[str, Node],
    predecessors: dict[str, list[str]],
) -> bool:
    seen: set[str] = set()
    queue = deque(predecessors.get(start, []))
    while queue:
        current = queue.popleft()
        if current in seen:
            continue
        seen.add(current)
        if nodes[current].kind == "human_gate":
            return True
        queue.extend(predecessors.get(current, []))
    return False
