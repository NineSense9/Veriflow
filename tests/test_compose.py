from veriflow_api.compiler import fallback_compile
from veriflow_staticcheck.check import check_workflow


def test_fallback_missing_gate():
    ir = fallback_compile("把题直接入库，不要审题门。")
    codes = {error.code for error in check_workflow(ir)}
    assert "MISSING_HUMAN_GATE" in codes


def test_fallback_missing_bounds_has_gate_but_attack():
    from veriflow_api.compose_attack import attack_compose

    ir = fallback_compile("生成测资，但不要写数据范围守卫。")
    assert check_workflow(ir) == []
    tags = {item["tag"] for item in attack_compose(ir)}
    assert "weak_bounds" in tags


def test_fallback_complete_is_clean():
    from veriflow_api.compose_attack import attack_compose

    ir = fallback_compile("完整出题，带守卫和审题。")
    assert check_workflow(ir) == []
    assert attack_compose(ir) == []
