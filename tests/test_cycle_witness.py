from veriflow_ir.graph import cycle_witness
from veriflow_ir.workflow import WorkflowIR


def _ir(nodes: list[str], edges: list[tuple[str, str]], name="g") -> WorkflowIR:
    return WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": name,
            "nodes": [{"id": nid, "kind": "transform"} for nid in nodes],
            "edges": [{"from": a, "to": b} for a, b in edges],
        }
    )


def _assert_cycle(ir: WorkflowIR, cyc: list[str]) -> None:
    assert cyc, "expected a cycle"
    assert cyc[0] == cyc[-1]
    have = {(e.from_, e.to) for e in ir.edges}
    for a, b in zip(cyc, cyc[1:]):
        assert (a, b) in have, f"missing edge {a}->{b} in {cyc}"


def test_self_loop():
    ir = _ir(["a"], [("a", "a")])
    cyc = cycle_witness(ir)
    _assert_cycle(ir, cyc)
    assert cyc == ["a", "a"]


def test_two_node_cycle():
    ir = _ir(["a", "b"], [("a", "b"), ("b", "a")])
    cyc = cycle_witness(ir)
    _assert_cycle(ir, cyc)
    assert len(cyc) == 3


def test_three_node_cycle():
    ir = _ir(["a", "b", "c"], [("a", "b"), ("b", "c"), ("c", "a")])
    cyc = cycle_witness(ir)
    _assert_cycle(ir, cyc)
    assert cyc == ["a", "b", "c", "a"] or set(cyc[:-1]) == {"a", "b", "c"}


def test_cycle_in_larger_graph():
    ir = _ir(
        ["s", "a", "b", "t"],
        [("s", "a"), ("a", "b"), ("b", "a"), ("b", "t")],
        name="embed",
    )
    cyc = cycle_witness(ir)
    _assert_cycle(ir, cyc)
    assert set(cyc) <= {"a", "b"}


def test_disconnected_component_cycle():
    ir = _ir(
        ["s", "t", "x", "y"],
        [("s", "t"), ("x", "y"), ("y", "x")],
        name="disc",
    )
    cyc = cycle_witness(ir)
    _assert_cycle(ir, cyc)
    assert set(cyc) <= {"x", "y"}
