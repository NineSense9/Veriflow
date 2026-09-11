from veriflow_api.compiler import _coerce_ir
from veriflow_ir.workflow import WorkflowIR


def test_coerce_ir_accepts_model_shape():
    payload = {
        "ir_version": "1.0",
        "domain": "compose",
        "nodes": [
            {"id": "gen", "kind": "tool", "tool": "test_generator", "params": {"spec": "spec"}},
            {"id": "g", "kind": "guard", "expr": "n>=1"},
            {"id": "gate", "kind": "human_gate", "assignee_role": "reviewer"},
            {"id": "pub", "kind": "tool", "tool": "publish_problem"},
        ],
        "edges": [
            {"from": "gen", "to": "g"},
            {"from": "g", "to": "gate"},
            {"from": "gate", "to": "pub"},
        ],
    }
    ir = WorkflowIR.model_validate(_coerce_ir(payload))
    assert ir.name == "compiled"
    assert ir.nodes[0].config["spec"] == "spec"
