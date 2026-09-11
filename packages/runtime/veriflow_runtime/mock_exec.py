from __future__ import annotations

from datetime import datetime, timezone

from veriflow_ir.graph import outgoing, sources
from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.effects import allowed, classify
from veriflow_runtime.hashing import workflow_hash
from veriflow_runtime.models import ExecutionTrace, TraceEvent


def mock_execute(
    ir: WorkflowIR,
    take_true_branch: bool = True,
    skip_after: str | None = None,
) -> ExecutionTrace:
    """Deterministic DAG walk. EXTERNAL_WRITE is mocked, never a real side effect."""
    adj = outgoing(ir)
    events: list[TraceEvent] = []
    index = 0
    clock = 0
    seen: set[str] = set()
    started = datetime.now(timezone.utc).isoformat()
    queue = list(sources(ir, fallback=True))
    terminal_status = "completed"
    while queue:
        nid = queue.pop(0)
        if nid in seen:
            continue
        seen.add(nid)
        node = ir.node_map()[nid]
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
        nxts = adj.get(nid, [])
        if node.kind == "branch":
            labeled = [edge for edge in ir.edges if edge.from_ == nid and edge.branch in {"true", "false"}]
            if labeled:
                wanted = "true" if take_true_branch else "false"
                nxts = [edge.to for edge in labeled if edge.branch == wanted]
            elif nxts:
                nxts = [nxts[0]] if take_true_branch else nxts[1:2] or nxts[:1]
        queue.extend(nxts)
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
