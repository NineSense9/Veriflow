from veriflow_spec.compiler import compile_spec
from veriflow_spec.validator import validate_spec


def test_compose_spec_has_gate_and_order():
    spec = compile_spec("完整出题，带守卫和审题。")
    assert spec.domain == "compose"
    assert validate_spec(spec) == []
    kinds = {(item.kind, item.tool) for item in spec.required_actions}
    assert ("human_gate", None) in kinds
    assert ("tool", "publish_problem") in kinds
    assert any(item.id == "ord_gate_pub" for item in spec.ordering_constraints)


def test_manual_spec_roundtrip():
    spec = compile_spec("生成测资")
    again = type(spec).model_validate_json(spec.model_dump_json())
    assert again.goal == spec.goal
