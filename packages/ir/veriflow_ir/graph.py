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


def sources(ir: WorkflowIR, *, fallback: bool = False) -> list[str]:
    indeg = {node.id: 0 for node in ir.nodes}
    for edge in ir.edges:
        indeg[edge.to] = indeg.get(edge.to, 0) + 1
    found = [node_id for node_id, deg in indeg.items() if deg == 0]
    if found:
        return found
    if fallback and ir.nodes:
        return [ir.nodes[0].id]
    return []


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


def bypass_path(ir: WorkflowIR, checkpoints: set[str], target: str) -> list[str] | None:
    """O(V+E) avoidance reachability: source ↝ target with no checkpoint on the path."""
    blocked = set(checkpoints)
    if target in blocked:
        return None
    starts = [sid for sid in sources(ir, fallback=False) if sid not in blocked]
    if not starts:
        return None
    adj = outgoing(ir)
    queue = deque()
    parent: dict[str, str | None] = {}
    seen: set[str] = set()
    for start in starts:
        queue.append(start)
        seen.add(start)
        parent[start] = None
    hit: str | None = None
    while queue:
        current = queue.popleft()
        if current == target:
            hit = current
            break
        for nxt in adj.get(current, []):
            if nxt in blocked or nxt in seen:
                continue
            seen.add(nxt)
            parent[nxt] = current
            queue.append(nxt)
    if hit is None:
        return None
    path = [hit]
    while parent[path[-1]] is not None:
        path.append(parent[path[-1]] or "")
    path.reverse()
    return path


def cycle_witness(ir: WorkflowIR) -> list[str] | None:
    """Return one directed cycle as [A, B, ..., A]. Self-loops included. O(V+E)."""
    adj = outgoing(ir)
    color: dict[str, int] = {}
    parent: dict[str, str | None] = {}
    WHITE, GRAY, BLACK = 0, 1, 2

    def reconstruct(end: str, start: str) -> list[str]:
        path = [end]
        while path[-1] != start:
            prev = parent.get(path[-1])
            if prev is None:
                break
            path.append(prev)
        path.reverse()
        if not path or path[0] != start:
            path = [start, *path]
        path.append(start)
        return path

    def dfs(node: str) -> list[str] | None:
        color[node] = GRAY
        for nxt in adj.get(node, []):
            if nxt == node:
                return [node, node]
            state = color.get(nxt, WHITE)
            if state == WHITE:
                parent[nxt] = node
                found = dfs(nxt)
                if found:
                    return found
            elif state == GRAY:
                return reconstruct(node, nxt)
        color[node] = BLACK
        return None

    for item in ir.nodes:
        if color.get(item.id, WHITE) == WHITE:
            parent[item.id] = None
            found = dfs(item.id)
            if found:
                return found
    return None


def fresh_id(ir: WorkflowIR, prefix: str) -> str:
    known = {node.id for node in ir.nodes}
    if prefix not in known:
        return prefix
    index = 2
    while f"{prefix}_{index}" in known:
        index += 1
    return f"{prefix}_{index}"
