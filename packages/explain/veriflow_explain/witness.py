from veriflow_ir.graph import paths_to
from veriflow_ir.workflow import WorkflowIR


def witness_skipping(ir: WorkflowIR, target: str, required: set[str]) -> list[str] | None:
    for path in paths_to(ir, target):
        if not required.intersection(path):
            return path
    return None
