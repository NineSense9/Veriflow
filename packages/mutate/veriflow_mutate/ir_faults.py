from __future__ import annotations

import json

from pydantic import BaseModel, ConfigDict

from veriflow_ir.workflow import WorkflowIR


class InvalidMutation(ValueError):
    pass

FAULTS = (
    "orphan_node",
    "broken_edge",
    "missing_required_action",
    "wrong_order",
    "missing_branch",
    "wrong_parameter",
    "broken_binding",
    "hardcoded_secret",
    "unsafe_webhook",
)


class MutatedWorkflow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ir: WorkflowIR
    fault: str
    fault_category: str
    fault_location: str
    expected_detection: str
    target_node: str = ""
    target_edge: str = ""
    mutation_operation: str = ""


def mutate_ir(ir: WorkflowIR, fault: str) -> MutatedWorkflow:
    if fault not in FAULTS:
        raise ValueError(f"unknown fault {fault}")
    data = ir.model_dump(mode="json", by_alias=True)
    before = json.dumps(data, sort_keys=True, ensure_ascii=False)
    category, location, expected, target_node, target_edge, op = _apply(data, fault)
    after = json.dumps(data, sort_keys=True, ensure_ascii=False)
    if after == before:
        raise InvalidMutation(f"fault {fault} did not change workflow")
    return MutatedWorkflow(
        ir=WorkflowIR.model_validate(data),
        fault=fault,
        fault_category=category,
        fault_location=location,
        expected_detection=expected,
        target_node=target_node,
        target_edge=target_edge,
        mutation_operation=op,
    )


def _apply(data: dict, fault: str) -> tuple[str, str, str, str, str, str]:
    nodes: list[dict] = data["nodes"]
    edges: list[dict] = data["edges"]
    if fault == "orphan_node":
        nodes.append({"id": "orphan", "kind": "transform"})
        return "structural", "orphan", "DEAD_NODE", "orphan", "", "add_node"
    if fault == "broken_edge":
        removed = edges.pop() if edges else {"from": "", "to": ""}
        edge = f"{removed.get('from')}->{removed.get('to')}"
        return "structural", "edges", "DEAD_NODE", "", edge, "disconnect_nodes"
    if fault == "missing_required_action":
        removed = {item["id"] for item in nodes if item.get("kind") == "human_gate"}
        data["nodes"] = [item for item in nodes if item["id"] not in removed]
        data["edges"] = [
            item for item in edges if item["from"] not in removed and item["to"] not in removed
        ]
        pubs = [item["id"] for item in data["nodes"] if item.get("tool") == "publish_problem"]
        if pubs and not any(item["to"] == pubs[0] for item in data["edges"]):
            srcs = [item["id"] for item in data["nodes"] if item.get("kind") == "guard"] or [
                item["id"] for item in data["nodes"] if item.get("tool") == "test_generator"
            ]
            if srcs:
                data["edges"].append({"from": srcs[0], "to": pubs[0]})
        gate = next(iter(removed), "human_gate")
        return "semantic", "human_gate", "MISSING_HUMAN_GATE", gate, "", "remove_node"
    if fault == "wrong_order":
        pubs = [n["id"] for n in nodes if n.get("tool") == "publish_problem"]
        gates = [n["id"] for n in nodes if n.get("kind") == "human_gate"]
        edge = ""
        if pubs and gates:
            data["edges"] = [
                e for e in edges if not (e["from"] == gates[0] and e["to"] == pubs[0])
            ]
            data["edges"].append({"from": pubs[0], "to": gates[0]})
            edge = f"{pubs[0]}->{gates[0]}"
        return "semantic", "publish_problem", "ORDER_VIOLATION", pubs[0] if pubs else "", edge, "connect_nodes"
    if fault == "missing_branch":
        removed = {n["id"] for n in nodes if n.get("kind") == "guard"}
        data["nodes"] = [item for item in nodes if item.get("kind") != "guard"]
        data["edges"] = [e for e in edges if e["from"] not in removed and e["to"] not in removed]
        gens = [n["id"] for n in data["nodes"] if n.get("tool") == "test_generator"]
        nxt = [n["id"] for n in data["nodes"] if n.get("kind") == "human_gate"] or [
            n["id"] for n in data["nodes"] if n.get("tool") == "publish_problem"
        ]
        if gens and nxt and not any(e["from"] == gens[0] and e["to"] == nxt[0] for e in data["edges"]):
            data["edges"].append({"from": gens[0], "to": nxt[0]})
        return "branch", "guard", "WEAK_BOUNDS", next(iter(removed), "guard"), "", "remove_node"
    if fault == "wrong_parameter":
        for node in nodes:
            if node.get("kind") == "guard":
                node["expr"] = "金额看起来对"
                return "parameter", node["id"], "GUARD_NOT_EXPR", node["id"], "", "update_condition"
        raise InvalidMutation("wrong_parameter needs a guard")
    if fault == "broken_binding":
        if edges:
            edges.clear()
            if len(nodes) >= 2:
                edges.append({"from": nodes[0]["id"], "to": nodes[-1]["id"]})
        return "dataflow", "edges", "BROKEN_BINDING", "", f"{nodes[0]['id']}->{nodes[-1]['id']}" if len(nodes) >= 2 else "", "update_binding"
    if fault == "hardcoded_secret":
        if not nodes:
            raise InvalidMutation("no node for secret")
        nodes[0]["config"] = {"api_key": "sk-demo-not-a-real-key"}
        return "safety", nodes[0]["id"], "HARDCODED_SECRET", nodes[0]["id"], "", "update_node_parameter"
    if fault == "unsafe_webhook":
        if not nodes:
            raise InvalidMutation("no node for webhook")
        nodes[-1]["config"] = {"url": "https://evil.example/hook"}
        return "safety", nodes[-1]["id"], "UNRESTRICTED_WEBHOOK", nodes[-1]["id"], "", "update_node_parameter"
    raise ValueError(fault)
