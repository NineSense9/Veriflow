from __future__ import annotations

from collections import deque
from datetime import datetime, timezone

from veriflow_ir.graph import outgoing, sources
from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.effects import allowed, classify
from veriflow_runtime.hashing import workflow_hash
from veriflow_runtime.models import ExecutionTrace, TraceEvent


def _reachable(adj: dict[str, list[str]], roots: list[str]) -> set[str]:
    reached: set[str] = set()
    pending = list(roots)
    while pending:
        nid = pending.pop()
        if nid in reached:
            continue
        reached.add(nid)
        pending.extend(adj.get(nid, []))
    return reached


def mock_execute(
    ir: WorkflowIR,
    take_true_branch: bool = True,
    skip_after: str | None = None,
) -> ExecutionTrace:
    """Deterministic DAG walk. EXTERNAL_WRITE is mocked, never a real side effect."""
    adj = outgoing(ir)
    nodes = ir.node_map()
    roots = sources(ir)
    reachable_without_selection = _reachable(adj, roots)
    # Branch choices are deterministic inputs to this mock. Resolve them first
    # so merge readiness counts only predecessors on the selected execution.
    selected = {nid: list(nxts) for nid, nxts in adj.items()}
    for node in ir.nodes:
        if node.kind != "branch":
            continue
        nxts = adj.get(node.id, [])
        labeled = [edge for edge in ir.edges if edge.from_ == node.id and edge.branch in {"true", "false"}]
        if labeled:
            wanted = "true" if take_true_branch else "false"
            selected[node.id] = [edge.to for edge in labeled if edge.branch == wanted]
        elif nxts:
            selected[node.id] = [nxts[0]] if take_true_branch else nxts[1:2] or nxts[:1]
    active = _reachable(selected, roots)
    # A component with no source is an unresolved cycle, not an untaken branch.
    active.update(set(nodes) - reachable_without_selection)
    predecessors: dict[str, set[str]] = {nid: set() for nid in active}
    for nid in active:
        for nxt in selected.get(nid, []):
            if nxt in active:
                predecessors[nxt].add(nid)
    events: list[TraceEvent] = []
    index = 0
    clock = 0
    seen: set[str] = set()
    started = datetime.now(timezone.utc).isoformat()
    queue = deque(roots)
    terminal_status = "completed"
    while queue:
        nid = queue.popleft()
        if nid in seen:
            continue
        seen.add(nid)
        node = nodes[nid]
        ok, mode = allowed(node)
        clock += 1
        if not ok:
            events.append(
                TraceEvent(
                    event_index=index,
                    timestamp_ms=clock,
                    node_id=nid,
                    node_type=node.kind,
                    operation=node.tool or node.kind,
                    input_summary="redacted",
                    output_summary="redacted",
                    status="blocked",
                    error=mode,
                    duration_ms=1,
                    external_effect=mode,
                )
            )
            terminal_status = "blocked"
            break
        status = "mocked" if mode == "MOCKED_EXTERNAL_EFFECT" else "success"
        branch = None
        if node.kind == "branch":
            branch = "true" if take_true_branch else "false"
        events.append(
            TraceEvent(
                event_index=index,
                timestamp_ms=clock,
                node_id=nid,
                node_type=node.kind,
                operation=node.tool or node.kind,
                input_summary="redacted",
                output_summary="redacted",
                status=status,
                duration_ms=1 + (12 if classify(node) == "READ_ONLY" else 0) + (128 if classify(node) == "EXTERNAL_WRITE" else 0),
                branch=branch,
                external_effect=mode if mode == "MOCKED_EXTERNAL_EFFECT" else None,
            )
        )
        index += 1
        if skip_after == nid:
            terminal_status = "completed"
            break
        for nxt in dict.fromkeys(selected.get(nid, [])):
            if nxt not in active:
                continue
            predecessors[nxt].discard(nid)
            if not predecessors[nxt]:
                queue.append(nxt)
    else:
        if active - seen:
            terminal_status = "failed"
    return ExecutionTrace(
        trace_id="mock",
        workflow_id=ir.name,
        workflow_hash=workflow_hash(ir),
        source="mock",
        start_time=started,
        end_time=datetime.now(timezone.utc).isoformat(),
        status=terminal_status,
        node_count=len(ir.nodes),
        events=events,
    )
