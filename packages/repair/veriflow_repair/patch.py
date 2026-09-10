from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Op = Literal[
    "add_node",
    "remove_node",
    "update_node_parameter",
    "replace_node_operation",
    "connect_nodes",
    "disconnect_nodes",
    "update_condition",
    "update_binding",
]


class Patch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation: Op
    node_id: str | None = None
    source: str | None = None
    target: str | None = None
    kind: str | None = None
    tool: str | None = None
    expr: str | None = None
    key: str | None = None
    value: Any = None
    node: dict[str, Any] | None = None
    reason: str = ""
