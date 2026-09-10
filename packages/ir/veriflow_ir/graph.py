from __future__ import annotations

from collections import defaultdict, deque

from veriflow_ir.workflow import Node, WorkflowIR


def outgoing(ir: WorkflowIR) -> dict[str, list[str]]:
    edges: dict[str, list[str]] = defaultdict(list)
    for edge in ir.edges:
        edges[edge.from_].append(edge.to)
    return edges


def incoming(ir: WorkflowIR) -> dict[str, list[str]]:
    edges: dict[str, list[str]] = defaultdict(list)
    for edge in ir.edges:
        edges[edge.to].append(edge.from_)
    return edges


def sources(ir: WorkflowIR) -> list[str]:
    indeg = {node.id: 0 for node in ir.nodes}
    for edge in ir.edges:
        indeg[edge.to] = indeg.get(edge.to, 0) + 1
    found = [node_id for node_id, deg in indeg.items() if deg == 0]
    return found or [node.id for node in ir.nodes[:1]]


def shortest_path(ir: WorkflowIR, start: str, goal: str) -> list[str] | None:
    if start == goal:
        return [start]
    adj = outgoing(ir)
    queue = deque([(start, [start])])
    seen = {start}
    while queue:
        current, path = queue.popleft()
        for nxt in adj.get(current, []):
            if nxt in seen:
                continue
            next_path = [*path, nxt]
            if nxt == goal:
                return next_path
            seen.add(nxt)
            queue.append((nxt, next_path))
    return None


def paths_to(ir: WorkflowIR, goal: str, limit: int = 16) -> list[list[str]]:
    adj = outgoing(ir)
    found: list[list[str]] = []
    for src in sources(ir):
        stack = [(src, [src], {src})]
        while stack and len(found) < limit:
            current, path, seen = stack.pop()
            if current == goal:
                found.append(path)
                continue
            for nxt in adj.get(current, []):
                if nxt in seen:
                    continue
                stack.append((nxt, [*path, nxt], seen | {nxt}))
    return found


def match_nodes(ir: WorkflowIR, selector: str) -> list[Node]:
    selector = selector.strip()
    out: list[Node] = []
    for node in ir.nodes:
        if node.id == selector or node.kind == selector or node.tool == selector:
            out.append(node)
    return out


def fresh_id(ir: WorkflowIR, prefix: str) -> str:
    known = {node.id for node in ir.nodes}
    if prefix not in known:
        return prefix
    index = 2
    while f"{prefix}_{index}" in known:
        index += 1
    return f"{prefix}_{index}"
