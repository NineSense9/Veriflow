from __future__ import annotations

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.patch import Patch


def apply_patches(ir: WorkflowIR, patches: list[Patch]) -> WorkflowIR:
    data = ir.model_dump(mode="json", by_alias=True)
    for patch in patches:
        data = apply_one(data, patch)
    return WorkflowIR.model_validate(data)


def apply_one(data: dict, patch: Patch) -> dict:
    nodes: list[dict] = data["nodes"]
    edges: list[dict] = data["edges"]
    if patch.operation == "add_node":
        node = patch.node or {
            "id": patch.node_id,
            "kind": patch.kind,
            "tool": patch.tool,
            "expr": patch.expr,
            "on_fail": "reject" if patch.kind in {"guard", "human_gate"} else None,
        }
        if any(item["id"] == node["id"] for item in nodes):
            return data
        nodes.append({key: value for key, value in node.items() if value is not None})
    elif patch.operation == "remove_node":
        data["nodes"] = [item for item in nodes if item["id"] != patch.node_id]
        data["edges"] = [
            item
            for item in edges
            if item["from"] != patch.node_id and item["to"] != patch.node_id
        ]
        return data
    elif patch.operation == "connect_nodes":
        if patch.source and patch.target:
            exists = any(item["from"] == patch.source and item["to"] == patch.target for item in edges)
            if not exists:
                edges.append({"from": patch.source, "to": patch.target})
    elif patch.operation == "disconnect_nodes":
        data["edges"] = [
            item
            for item in edges
            if not (item["from"] == patch.source and item["to"] == patch.target)
        ]
        return data
    elif patch.operation == "update_condition":
        for node in nodes:
            if node["id"] == patch.node_id:
                node["expr"] = patch.expr
                node["kind"] = node.get("kind") or "guard"
                node["on_fail"] = node.get("on_fail") or "reject"
    elif patch.operation == "update_node_parameter":
        for node in nodes:
            if node["id"] == patch.node_id:
                config = dict(node.get("config") or {})
                if patch.value is None:
                    config.pop(patch.key or "", None)
                else:
                    config[patch.key or "value"] = patch.value
                node["config"] = config
    elif patch.operation == "replace_node_operation":
        for node in nodes:
            if node["id"] == patch.node_id:
                if patch.tool:
                    node["tool"] = patch.tool
                if patch.kind:
                    node["kind"] = patch.kind
    elif patch.operation == "update_binding":
        if patch.source and patch.target:
            edges.append({"from": patch.source, "to": patch.target})
    data["nodes"] = nodes
    data["edges"] = edges
    return data
