from veriflow_ir.graph import bypass_path, cycle_witness
from veriflow_ir.workflow import WorkflowIR
from veriflow_staticcheck.check import check_workflow
from veriflow_spec.compiler import compile_spec
from veriflow_verify.semantic import semantic_issues


def _ir(nodes: list[dict], edges: list[tuple[str, str]], name="g") -> WorkflowIR:
    return WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": name,
            "nodes": nodes,
            "edges": [{"from": a, "to": b} for a, b in edges],
        }
    )


def test_all_paths_through_gate_pass():
    ir = _ir(
        [
            {"id": "s", "kind": "tool", "tool": "test_generator"},
            {"id": "g", "kind": "human_gate", "assignee_role": "problemsetter", "on_fail": "reject"},
            {"id": "p", "kind": "tool", "tool": "publish_problem"},
        ],
        [("s", "g"), ("g", "p")],
    )
    codes = {e.code for e in check_workflow(ir)}
    assert "MISSING_HUMAN_GATE" not in codes
    assert bypass_path(ir, {"g"}, "p") is None


def test_bypass_gate_fails_with_witness():
    ir = _ir(
        [
            {"id": "s", "kind": "tool", "tool": "test_generator"},
            {"id": "g", "kind": "human_gate", "assignee_role": "problemsetter", "on_fail": "reject"},
            {"id": "p", "kind": "tool", "tool": "publish_problem"},
        ],
        [("s", "g"), ("g", "p"), ("s", "p")],
        name="bypass",
    )
    errors = [e for e in check_workflow(ir) if e.code == "MISSING_HUMAN_GATE"]
    assert errors
    path = errors[0].witness
    assert path[0] == "s" and path[-1] == "p"
    assert "g" not in path


def test_multi_source_one_bypass_fails():
    ir = _ir(
        [
            {"id": "s1", "kind": "tool", "tool": "test_generator"},
            {"id": "s2", "kind": "tool", "tool": "test_generator"},
            {"id": "g", "kind": "human_gate", "assignee_role": "problemsetter", "on_fail": "reject"},
            {"id": "p", "kind": "tool", "tool": "publish_problem"},
        ],
        [("s1", "g"), ("g", "p"), ("s2", "p")],
    )
    errors = [e for e in check_workflow(ir) if e.code == "MISSING_HUMAN_GATE"]
    assert errors
    assert "s2" in errors[0].witness


def test_either_gate_on_every_path_passes():
    ir = _ir(
        [
            {"id": "s", "kind": "tool", "tool": "test_generator"},
            {"id": "g1", "kind": "human_gate", "assignee_role": "problemsetter", "on_fail": "reject"},
            {"id": "g2", "kind": "human_gate", "assignee_role": "problemsetter", "on_fail": "reject"},
            {"id": "p", "kind": "tool", "tool": "publish_problem"},
        ],
        [("s", "g1"), ("s", "g2"), ("g1", "p"), ("g2", "p")],
    )
    assert not any(e.code == "MISSING_HUMAN_GATE" for e in check_workflow(ir))


def test_cycle_self_loop_detected():
    ir = _ir(
        [
            {"id": "a", "kind": "tool", "tool": "test_generator"},
            {"id": "b", "kind": "tool", "tool": "publish_problem"},
        ],
        [("a", "b"), ("b", "b")],
        name="loop",
    )
    cyc = cycle_witness(ir)
    assert cyc is not None
    assert cyc[0] == cyc[-1]
    assert "CYCLE_DETECTED" in {e.code for e in check_workflow(ir)}


def test_cycle_three_nodes():
    ir = _ir(
        [
            {"id": "a", "kind": "transform"},
            {"id": "b", "kind": "transform"},
            {"id": "c", "kind": "transform"},
        ],
        [("a", "b"), ("b", "c"), ("c", "a")],
        name="cyc3",
    )
    cyc = cycle_witness(ir)
    assert cyc is not None and len(cyc) >= 4
    assert "CYCLE_DETECTED" in {e.code for e in check_workflow(ir)}


def test_ordering_bypass_not_bounded_by_16_paths():
    ir = _ir(
        [
            {"id": "s", "kind": "tool", "tool": "test_generator"},
            {"id": "guard", "kind": "guard", "expr": "n>=1", "on_fail": "reject"},
            {"id": "pub", "kind": "tool", "tool": "publish_problem"},
        ],
        [("s", "guard"), ("guard", "pub"), ("s", "pub")],
        name="order_bypass",
    )
    from veriflow_spec.models import OrderingConstraint, WorkflowSpec

    spec = WorkflowSpec(
        domain="compose",
        goal="t",
        ordering_constraints=[
            OrderingConstraint(id="o1", before="guard", after="publish_problem", requirement="guard before publish"),
        ],
    )
    issues = semantic_issues(ir, spec)
    order = [i for i in issues if i.code == "ORDER_VIOLATION"]
    assert order
    assert "s" in order[0].witness_path and "pub" in order[0].witness_path
    assert "guard" not in order[0].witness_path
