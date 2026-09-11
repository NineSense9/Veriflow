from __future__ import annotations

from typing import Protocol

from veriflow_ir.n8n_subset import ir_to_n8n, n8n_to_ir
from veriflow_ir.workflow import WorkflowIR


class WorkflowAdapter(Protocol):
    name: str

    def to_ir(self, payload: dict) -> WorkflowIR: ...

    def from_ir(self, ir: WorkflowIR) -> dict: ...


class ComposeJsonAdapter:
    name = "compose-json"

    def to_ir(self, payload: dict) -> WorkflowIR:
        return WorkflowIR.model_validate(payload)

    def from_ir(self, ir: WorkflowIR) -> dict:
        return ir.model_dump(mode="json", by_alias=True)


class N8nAdapter:
    """Subset mapper: n8n-shaped nodes/connections. Not a live n8n control plane."""

    name = "n8n-subset"

    def to_ir(self, payload: dict) -> WorkflowIR:
        return n8n_to_ir(payload)

    def from_ir(self, ir: WorkflowIR) -> dict:
        return ir_to_n8n(ir)


class DifyAdapter:
    name = "dify"

    def to_ir(self, payload: dict) -> WorkflowIR:
        raise NotImplementedError("Dify adapter is planned")

    def from_ir(self, ir: WorkflowIR) -> dict:
        raise NotImplementedError("Dify adapter is planned")


ADAPTERS: dict[str, WorkflowAdapter] = {
    "compose-json": ComposeJsonAdapter(),
    "n8n": N8nAdapter(),
    "n8n-subset": N8nAdapter(),
    "dify": DifyAdapter(),
}


def get_adapter(name: str = "compose-json") -> WorkflowAdapter:
    if name not in ADAPTERS:
        raise KeyError(f"unknown adapter {name}")
    return ADAPTERS[name]
