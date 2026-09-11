"""Unified node semantics. Static / safety / runtime query this instead of local if-ladders."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.workflow import Node

Support = Literal["full", "partial", "unknown"]
SideEffect = Literal[
    "PURE",
    "READ_ONLY",
    "CONTROL_FLOW",
    "EXTERNAL_WRITE",
    "DESTRUCTIVE",
    "UNKNOWN_SIDE_EFFECT",
]


class NodeSemantics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_type: str
    display_name: str
    category: str
    operations: list[str] = Field(default_factory=list)
    required_parameters: list[str] = Field(default_factory=list)
    input_semantics: str = ""
    output_semantics: str = ""
    capabilities: list[str] = Field(default_factory=list)
    side_effect_level: SideEffect = "UNKNOWN_SIDE_EFFECT"
    source_labels: list[str] = Field(default_factory=list)
    sink_labels: list[str] = Field(default_factory=list)
    credential_requirement: str = "none"
    runtime_behavior: str = ""
    known_limitations: str = ""
    version: str = "1.0"
    support: Support = "full"
    domains: list[str] = Field(default_factory=list)


def _kind(kind: str, name: str, **kwargs) -> NodeSemantics:
    payload = {
        "node_type": kind,
        "display_name": name,
        "category": "control",
        "operations": [kind],
        "side_effect_level": "CONTROL_FLOW",
        "runtime_behavior": "deterministic control",
        "domains": ["compose", "campus"],
        "support": "full",
        "version": "1.0",
    }
    payload.update(kwargs)
    return NodeSemantics.model_validate(payload)


def _tool(tool: str, name: str, domain: str, effect: SideEffect, **kwargs) -> NodeSemantics:
    payload = {
        "node_type": tool,
        "display_name": name,
        "category": "tool",
        "operations": [tool],
        "side_effect_level": effect,
        "domains": [domain],
        "support": "full",
        "version": "1.0",
        "runtime_behavior": "mock-execute; writes are mocked",
    }
    payload.update(kwargs)
    return NodeSemantics.model_validate(payload)


KIND_SEMANTICS: dict[str, NodeSemantics] = {
    "tool": _kind("tool", "Tool", category="tool", side_effect_level="UNKNOWN_SIDE_EFFECT"),
    "guard": _kind(
        "guard",
        "Bounds guard",
        required_parameters=["expr", "on_fail"],
        capabilities=["filter"],
        known_limitations="expr is a comparison AST, not arbitrary code",
    ),
    "human_gate": _kind(
        "human_gate",
        "Human review gate",
        required_parameters=["on_fail"],
        capabilities=["approval"],
        sink_labels=["review"],
    ),
    "transform": _kind("transform", "Transform", category="data", capabilities=["map"]),
    "branch": _kind(
        "branch",
        "Conditional branch",
        operations=["branch"],
        capabilities=["if"],
        known_limitations="static branch constraints are often UNKNOWN; runtime uses recorded branch label",
    ),
    "notify": _kind(
        "notify",
        "Notification",
        category="effect",
        side_effect_level="EXTERNAL_WRITE",
        sink_labels=["external"],
        runtime_behavior="MOCKED_EXTERNAL_EFFECT",
    ),
}

TOOL_SEMANTICS: dict[str, NodeSemantics] = {
    "test_generator": _tool(
        "test_generator",
        "Test generator",
        "compose",
        "PURE",
        output_semantics="tests object",
        source_labels=["generator"],
        capabilities=["produce_tests"],
    ),
    "run_brute": _tool("run_brute", "Brute solver", "compose", "READ_ONLY", capabilities=["oracle"]),
    "publish_problem": _tool(
        "publish_problem",
        "Publish problem",
        "compose",
        "EXTERNAL_WRITE",
        sink_labels=["external", "publish"],
        runtime_behavior="MOCKED_EXTERNAL_EFFECT",
        capabilities=["terminal"],
    ),
    "invoice_ocr": _tool("invoice_ocr", "Invoice OCR", "campus", "READ_ONLY", source_labels=["ocr"]),
    "form_fill": _tool("form_fill", "Form fill", "campus", "EXTERNAL_WRITE", sink_labels=["external"]),
    "oss_put": _tool("oss_put", "Object store put", "campus", "EXTERNAL_WRITE", sink_labels=["external"]),
    "notify_email": _tool(
        "notify_email",
        "Email notify",
        "campus",
        "EXTERNAL_WRITE",
        sink_labels=["external", "email"],
        credential_requirement="optional",
    ),
    "http_get": _tool("http_get", "HTTP GET", "compose", "READ_ONLY", support="partial"),
    "http_post": _tool(
        "http_post",
        "HTTP POST",
        "compose",
        "EXTERNAL_WRITE",
        support="partial",
        sink_labels=["external"],
    ),
    "db_update": _tool("db_update", "DB update", "compose", "EXTERNAL_WRITE", support="partial"),
    "delete_problem": _tool("delete_problem", "Delete", "compose", "DESTRUCTIVE", support="partial"),
    "payment_charge": _tool("payment_charge", "Payment", "compose", "DESTRUCTIVE", support="partial"),
}

UNKNOWN = NodeSemantics(
    node_type="unknown",
    display_name="Unknown node",
    category="unknown",
    support="unknown",
    side_effect_level="UNKNOWN_SIDE_EFFECT",
    known_limitations="Not in NodeSemanticsRegistry; verifiers must not default to PASS",
    runtime_behavior="blocked",
    version="1.0",
)

DEFAULT_BINDINGS = frozenset({"spec", "input", "output", "tests"})


def lookup(node: Node) -> NodeSemantics:
    if node.tool:
        if node.tool in TOOL_SEMANTICS:
            return TOOL_SEMANTICS[node.tool]
        return UNKNOWN.model_copy(update={"node_type": node.tool, "display_name": node.tool})
    if node.kind in KIND_SEMANTICS:
        return KIND_SEMANTICS[node.kind]
    return UNKNOWN


def side_effect_for(node: Node) -> SideEffect:
    return lookup(node).side_effect_level


def _domain_tools() -> dict[str, frozenset[str]]:
    out: dict[str, set[str]] = {"compose": set(), "campus": set()}
    for tool, sem in TOOL_SEMANTICS.items():
        if sem.support != "full":
            continue
        for domain in sem.domains:
            if domain in out:
                out[domain].add(tool)
    return {key: frozenset(value) for key, value in out.items()}


DOMAIN_TOOLS: dict[str, frozenset[str]] = _domain_tools()
TERMINAL_TOOLS = frozenset(
    tool
    for tool, sem in TOOL_SEMANTICS.items()
    if "terminal" in sem.capabilities or "publish" in sem.sink_labels or tool in {"publish_problem", "notify_email", "oss_put"}
)
TERMINAL_KINDS = frozenset({"notify"})


def coverage_for_ir(nodes: list[Node]) -> dict:
    full: list[str] = []
    partial: list[str] = []
    unknown: list[str] = []
    for node in nodes:
        sem = lookup(node)
        label = node.tool or node.kind
        if sem.support == "full":
            full.append(node.id)
        elif sem.support == "partial":
            partial.append(node.id)
        else:
            unknown.append(f"{node.id}:{label}")
    total = max(len(nodes), 1)
    return {
        "fully_supported": full,
        "partially_supported": partial,
        "unknown": unknown,
        "coverage": (len(full) + 0.5 * len(partial)) / total,
        "unknown_must_not_pass": True,
    }


def registry_dump() -> list[dict]:
    items = list(KIND_SEMANTICS.values()) + list(TOOL_SEMANTICS.values())
    return [item.model_dump() for item in items]
