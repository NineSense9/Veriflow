from __future__ import annotations

import hashlib
import json
from typing import Any

from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.models import WorkflowSpec


def canonical_ir(ir: WorkflowIR) -> dict:
    nodes = sorted(
        (
            {
                "id": node.id,
                "kind": node.kind,
                "tool": node.tool,
                "expr": node.expr,
                "on_fail": node.on_fail,
                "config": node.config or {},
                "in_type": node.in_type.model_dump() if node.in_type else None,
                "out_type": node.out_type.model_dump() if node.out_type else None,
            }
            for node in ir.nodes
        ),
        key=lambda item: item["id"],
    )
    edges = [{"from": a, "to": b} for a, b in sorted((edge.from_, edge.to) for edge in ir.edges)]
    return {"domain": ir.domain, "nodes": nodes, "edges": edges}


def canonical_spec(spec: WorkflowSpec) -> dict:
    payload = spec.model_dump(mode="json")
    payload.pop("source_nl", None)
    payload.pop("evidence", None)
    payload.pop("compiler", None)
    payload.pop("compiler_basis", None)
    payload.pop("source_traces", None)
    payload.pop("goal", None)
    return _sort(payload)


def _sort(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _sort(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        items = [_sort(item) for item in value]
        try:
            return sorted(items, key=lambda item: json.dumps(item, sort_keys=True))
        except TypeError:
            return items
    return value


def workflow_hash(ir: WorkflowIR) -> str:
    blob = json.dumps(canonical_ir(ir), sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(blob).hexdigest()[:16]


def spec_hash(spec: WorkflowSpec) -> str:
    blob = json.dumps(canonical_spec(spec), sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(blob).hexdigest()[:16]
