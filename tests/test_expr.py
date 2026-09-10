import pytest

from veriflow_ir.expr import GuardExprError, free_names, parse_guard


def test_js_logic_and_comparison():
    tree = parse_guard("spec.n_min >= 1 && spec.n_max <= 100000")
    assert tree is not None
    assert free_names("spec.n_min >= 1 && spec.n_max <= 100000") == {"spec"}


def test_reject_natural_language():
    with pytest.raises(GuardExprError):
        parse_guard("金额看起来对")


def test_reject_import():
    with pytest.raises(GuardExprError):
        parse_guard("__import__('os').system('x')")


def test_allow_min_len():
    parse_guard("len(tests) >= 1 and max(spec.n_max, 1) <= 100000")
    assert "spec" in free_names("len(tests) >= 1 and max(spec.n_max, 1) <= 100000")
    assert "tests" in free_names("len(tests) >= 1 and max(spec.n_max, 1) <= 100000")
