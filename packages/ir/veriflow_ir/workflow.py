from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

NODE_KINDS = frozenset(
    {"tool", "guard", "human_gate", "transform", "branch", "notify"}
)

NodeKind = Literal["tool", "guard", "human_gate", "transform", "branch", "notify"]
Domain = Literal["compose", "campus"]
OnFail = Literal["reject", "skip"]
JsonTypeName = Literal["object", "array", "number", "integer", "string", "boolean"]


class JsonType(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: JsonTypeName
    required: list[str] | None = None
    properties: dict[str, Any] | None = None
    items: Any | None = None


class Node(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: NodeKind
    tool: str | None = None
    expr: str | None = None
    on_fail: OnFail | None = None
    assignee_role: str | None = None
    in_type: JsonType | None = None
    out_type: JsonType | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class Edge(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(alias="from")
    to: str


class WorkflowIR(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ir_version: Literal["1.0"]
    domain: Domain
    name: str
    nodes: list[Node]
    edges: list[Edge]

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be empty")
        return value

    @model_validator(mode="after")
    def unique_node_ids(self) -> WorkflowIR:
        ids = [node.id for node in self.nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate node id")
        known = set(ids)
        for edge in self.edges:
            if edge.from_ not in known or edge.to not in known:
                raise ValueError("edge references unknown node")
        return self

    def node_map(self) -> dict[str, Node]:
        return {node.id: node for node in self.nodes}
