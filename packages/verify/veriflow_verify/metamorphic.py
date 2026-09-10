from __future__ import annotations

from copy import deepcopy

from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.models import WorkflowSpec
from veriflow_verify.result import verify_workflow


def rename_ids(ir: WorkflowIR, prefix: str = "n") -> WorkflowIR:
    mapping = {node.id: f"{prefix}{index}" for index, node in enumerate(ir.nodes, start=1)}
    data = ir.model_dump(mode="json", by_alias=True)
    for node in data["nodes"]:
        node["id"] = mapping[node["id"]]
    for edge in data["edges"]:
        edge["from"] = mapping[edge["from"]]
        edge["to"] = mapping[edge["to"]]
    data["nodes"] = list(reversed(data["nodes"]))
    return WorkflowIR.model_validate(data)


def shuffle_nodes(ir: WorkflowIR) -> WorkflowIR:
    data = deepcopy(ir.model_dump(mode="json", by_alias=True))
    data["nodes"] = list(reversed(data["nodes"]))
    return WorkflowIR.model_validate(data)


def consistent(ir: WorkflowIR, spec: WorkflowSpec) -> bool:
    base = verify_workflow(ir, spec)
    renamed = verify_workflow(rename_ids(ir), spec)
    shuffled = verify_workflow(shuffle_nodes(ir), spec)
    def sig(result):
        return result.status, tuple(sorted(item.code for item in result.issues))
    return sig(base) == sig(renamed) == sig(shuffled)
