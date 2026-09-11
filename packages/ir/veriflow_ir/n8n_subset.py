"""n8n-shaped JSON subset. Not a live n8n product; lossless for WorkflowIR fields we store in parameters."""

from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR

KIND_TYPE = {
    "tool": "n8n-nodes-base.httpRequest",
    "guard": "n8n-nodes-base.if",
    "human_gate": "n8n-nodes-base.noOp",
    "transform": "n8n-nodes-base.set",
    "branch": "n8n-nodes-base.switch",
    "notify": "n8n-nodes-base.emailSend",
}

TYPE_KIND = {value: key for key, value in KIND_TYPE.items()}


def ir_to_n8n(ir: WorkflowIR) -> dict:
    nodes = []
    for node in ir.nodes:
        item = {
            "id": node.id,
            "name": node.id,
            "type": KIND_TYPE.get(node.kind, "n8n-nodes-base.noOp"),
            "parameters": {
                "kind": node.kind,
                "tool": node.tool,
                "expr": node.expr,
                "on_fail": node.on_fail,
                "assignee_role": node.assignee_role,
                "config": node.config,
                "in_type": node.in_type.model_dump() if node.in_type else None,
                "out_type": node.out_type.model_dump() if node.out_type else None,
            },
            "typeVersion": 1,
        }
        creds = (node.config or {}).get("_n8n_credentials")
        if creds:
            item["credentials"] = creds
        nodes.append(item)
    connections: dict = {}
    for edge in ir.edges:
        connections.setdefault(edge.from_, {"main": [[]]})
        connections[edge.from_]["main"][0].append({"node": edge.to, "type": "main", "index": 0})
    return {
        "name": ir.name,
        "nodes": nodes,
        "connections": connections,
        "settings": {},
        "meta": {"veriflow_domain": ir.domain, "veriflow_ir_version": ir.ir_version},
    }


def n8n_to_ir(payload: dict) -> WorkflowIR:
    if payload.get("ir_version"):
        return WorkflowIR.model_validate(payload)
    domain = (payload.get("meta") or {}).get("veriflow_domain") or "compose"
    nodes = []
    for raw in payload.get("nodes") or []:
        params = raw.get("parameters") or {}
        kind = params.get("kind") or TYPE_KIND.get(raw.get("type") or "", "tool")
        config = dict(params.get("config") or {})
        if raw.get("credentials"):
            config["_n8n_credentials"] = raw.get("credentials")
        nodes.append(
            {
                "id": raw.get("id") or raw.get("name"),
                "kind": kind,
                "tool": params.get("tool"),
                "expr": params.get("expr"),
                "on_fail": params.get("on_fail"),
                "assignee_role": params.get("assignee_role"),
                "config": config,
                "in_type": params.get("in_type"),
                "out_type": params.get("out_type"),
            }
        )
    edges = []
    for src, bundle in (payload.get("connections") or {}).items():
        for lane in bundle.get("main") or []:
            for dest in lane:
                edges.append({"from": src, "to": dest.get("node")})
    cleaned_nodes = [{k: v for k, v in node.items() if v is not None} for node in nodes]
    return WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": domain,
            "name": payload.get("name") or "n8n_import",
            "nodes": cleaned_nodes,
            "edges": edges,
        }
    )


def round_trip_ok(ir: WorkflowIR) -> tuple[bool, list[str]]:
    """IR → n8n-shaped JSON → IR. Semantic fields must survive."""
    exported = ir_to_n8n(ir)
    back = n8n_to_ir(exported)
    errors: list[str] = []
    if {n.id for n in ir.nodes} != {n.id for n in back.nodes}:
        errors.append("node ids")
    if {n.id: n.kind for n in ir.nodes} != {n.id: n.kind for n in back.nodes}:
        errors.append("node kinds")
    if {n.id: n.tool for n in ir.nodes} != {n.id: n.tool for n in back.nodes}:
        errors.append("tools")
    if {n.id: n.expr for n in ir.nodes} != {n.id: n.expr for n in back.nodes}:
        errors.append("expressions")
    configs_a = {n.id: {k: v for k, v in (n.config or {}).items() if k != "_n8n_credentials"} for n in ir.nodes}
    configs_b = {n.id: {k: v for k, v in (n.config or {}).items() if k != "_n8n_credentials"} for n in back.nodes}
    if configs_a != configs_b:
        errors.append("parameters")
    if {(e.from_, e.to) for e in ir.edges} != {(e.from_, e.to) for e in back.edges}:
        errors.append("connections")
    if not isinstance(exported.get("settings"), dict):
        errors.append("settings")
    if not exported.get("meta"):
        errors.append("metadata")
    types_a = {n.id: (n.in_type.model_dump() if n.in_type else None, n.out_type.model_dump() if n.out_type else None) for n in ir.nodes}
    types_b = {n.id: (n.in_type.model_dump() if n.in_type else None, n.out_type.model_dump() if n.out_type else None) for n in back.nodes}
    if types_a != types_b:
        errors.append("types")
    return not errors, errors


class RoundTripValidator:
    def validate(self, ir: WorkflowIR) -> tuple[bool, list[str]]:
        return round_trip_ok(ir)

    def dropped_from_native_n8n(self, payload: dict) -> list[str]:
        dropped: list[str] = []
        for raw in payload.get("nodes") or []:
            if raw.get("credentials") and not (raw.get("parameters") or {}).get("config"):
                # credentials are preserved only when round-tripped through ir_to_n8n
                pass
            if "position" in raw:
                dropped.append("ui position (intentionally ignored)")
                break
        return dropped
