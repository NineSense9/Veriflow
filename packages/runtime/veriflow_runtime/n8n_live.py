"""Optional live n8n adapter. Never crash when credentials are missing.

This is Integration Mode. Default demo uses mock_execute.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from veriflow_runtime.models import ExecutionTrace, TraceEvent


def n8n_status() -> dict:
    url = os.environ.get("N8N_BASE_URL", "").strip()
    key = os.environ.get("N8N_API_KEY", "").strip()
    if not url or not key:
        return {
            "available": False,
            "reason": "Integration unavailable: set N8N_BASE_URL and N8N_API_KEY",
            "fallback": "mock",
        }
    return {"available": True, "reason": "configured", "fallback": None}


def execution_to_trace(payload: dict, workflow_id: str = "", workflow_hash: str = "") -> ExecutionTrace:
    """Convert an n8n execution JSON (or a Veriflow-shaped events list) to ExecutionTrace."""
    raw_events = payload.get("data") or payload.get("events") or []
    events: list[TraceEvent] = []
    if isinstance(raw_events, dict):
        raw_events = [
            {"node": name, **(item if isinstance(item, dict) else {})}
            for name, item in raw_events.items()
        ]
    for index, item in enumerate(raw_events):
        if not isinstance(item, dict):
            continue
        node_id = str(item.get("node") or item.get("node_id") or item.get("name") or f"n{index}")
        status_raw = str(item.get("status") or item.get("executionStatus") or "success").lower()
        status = "success"
        if status_raw in {"error", "failed", "crashed"}:
            status = "error"
        elif status_raw in {"waiting", "running"}:
            status = "skipped"
        events.append(
            TraceEvent(
                event_index=index,
                timestamp_ms=int(item.get("timestamp_ms") or index),
                node_id=node_id,
                node_type=str(item.get("node_type") or item.get("type") or "tool"),
                operation=str(item.get("operation") or node_id),
                input_summary="redacted",
                output_summary="redacted",
                status=status,  # type: ignore[arg-type]
                duration_ms=int(item.get("duration_ms") or 0),
                error=str(item["error"]) if item.get("error") else None,
            )
        )
    return ExecutionTrace(
        trace_id=str(payload.get("id") or payload.get("trace_id") or "n8n"),
        workflow_id=workflow_id or str(payload.get("workflowId") or "n8n"),
        workflow_hash=workflow_hash,
        source="n8n",
        start_time=str(payload.get("startedAt") or ""),
        end_time=str(payload.get("stoppedAt") or ""),
        status="failed" if any(event.status == "error" for event in events) else "completed",
        node_count=len({event.node_id for event in events}),
        events=events,
    )


def try_fetch_execution(execution_id: str) -> tuple[ExecutionTrace | None, dict]:
    status = n8n_status()
    if not status["available"]:
        return None, status
    base = os.environ["N8N_BASE_URL"].rstrip("/")
    key = os.environ["N8N_API_KEY"]
    req = urllib.request.Request(
        f"{base}/api/v1/executions/{execution_id}",
        headers={"X-N8N-API-KEY": key, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return execution_to_trace(payload), status
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        return None, {
            "available": False,
            "reason": f"n8n fetch failed: {exc}",
            "fallback": "mock",
        }
