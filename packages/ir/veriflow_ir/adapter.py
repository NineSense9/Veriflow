from __future__ import annotations

from typing import Protocol

from veriflow_ir.workflow import WorkflowIR


class WorkflowAdapter(Protocol):
    name: str

    def to_ir(self, payload: dict) -> WorkflowIR: ...

    def from_ir(self, ir: WorkflowIR) -> dict: ...


class ComposeJsonAdapter:
    """Canonical adapter: native WorkflowIR JSON used by compose examples."""

    name = "compose-json"

    def to_ir(self, payload: dict) -> WorkflowIR:
        return WorkflowIR.model_validate(payload)

    def from_ir(self, ir: WorkflowIR) -> dict:
        return ir.model_dump(mode="json", by_alias=True)


class N8nAdapter:
    name = "n8n"

    def to_ir(self, payload: dict) -> WorkflowIR:
        raise NotImplementedError(
            "n8n adapter is planned; current full support is compose-json WorkflowIR"
        )

    def from_ir(self, ir: WorkflowIR) -> dict:
        raise NotImplementedError(
            "n8n adapter is planned; current full support is compose-json WorkflowIR"
        )


class DifyAdapter:
    name = "dify"

    def to_ir(self, payload: dict) -> WorkflowIR:
        raise NotImplementedError("Dify adapter is planned")

    def from_ir(self, ir: WorkflowIR) -> dict:
        raise NotImplementedError("Dify adapter is planned")


ADAPTERS: dict[str, WorkflowAdapter] = {
    "compose-json": ComposeJsonAdapter(),
    "n8n": N8nAdapter(),
    "dify": DifyAdapter(),
}


def get_adapter(name: str = "compose-json") -> WorkflowAdapter:
    if name not in ADAPTERS:
        raise KeyError(f"unknown adapter {name}")
    return ADAPTERS[name]
