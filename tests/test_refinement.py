from pathlib import Path

from veriflow_explain.minimize import minimize_issue
from veriflow_ir.semantics import coverage_for_ir, lookup
from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.align import align_trace
from veriflow_runtime.mock_exec import mock_execute
from veriflow_spec.compiler import compile_spec
from veriflow_verify.algorithms import get_algorithm, list_algorithms
from veriflow_verify.matrix import build_matrix
from veriflow_verify.pipeline import run_session
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def _gold() -> WorkflowIR:
    return WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))


def test_alignment_match_on_gold():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    result = align_trace(ir, spec, mock_execute(ir))
    assert result.deviation_count == 0
    assert result.alignment_cost == 0
    assert all(row.kind == "MATCH" for row in result.alignment)


def test_alignment_missing_after_skip():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    result = align_trace(ir, spec, mock_execute(ir, skip_after="g_bounds"))
    kinds = {row.kind for row in result.minimal_deviation}
    assert "MISSING_EXPECTED" in kinds
    assert result.deviation_count >= 1


def test_alignment_concurrent_not_out_of_order():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "po",
            "nodes": [
                {"id": "a", "kind": "tool", "tool": "test_generator"},
                {"id": "b", "kind": "transform"},
                {"id": "c", "kind": "transform"},
                {"id": "d", "kind": "tool", "tool": "publish_problem"},
            ],
            "edges": [
                {"from": "a", "to": "b"},
                {"from": "a", "to": "c"},
                {"from": "b", "to": "d"},
                {"from": "c", "to": "d"},
            ],
        }
    )
    spec = compile_spec("完整出题。")
    trace = mock_execute(ir)
    observed = [event.node_id for event in trace.events]
    assert "b" in observed and "c" in observed
    result = align_trace(ir, spec, trace)
    assert not any(row.kind == "OUT_OF_ORDER" for row in result.alignment)


def test_minimizer_smaller_than_graph():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题。")
    result = verify_workflow(ir, spec)
    gate = next(issue for issue in result.issues if issue.code == "MISSING_HUMAN_GATE")
    mini = minimize_issue(ir, gate)
    assert mini.globally_minimal is False
    assert 0 < len(mini.minimized_nodes) <= len(ir.nodes)
    assert mini.original_node_count == len(ir.nodes)
    assert "gen" in mini.minimized_nodes or "pub" in mini.minimized_nodes


def test_matrix_uses_real_constraints():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    static = verify_workflow(ir, spec)
    matrix = build_matrix(spec, static, None)
    assert matrix.rows
    assert "semantic" in matrix.rows[0].cells
    assert any(row.cells["semantic"].status == "PASS" for row in matrix.rows)


def test_pipeline_session_case4():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/golden/case4_runtime_ir.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。当 payment_status == success 时发送通知。")
    session = run_session(ir, spec, skip_after="if_pay")
    assert session.static.status == "PASS"
    assert session.runtime.status == "FAIL"
    assert session.cross.pattern == "STATIC PASS + RUNTIME FAIL"
    assert session.alignment.deviation_count >= 1
    assert session.matrix.rows
    assert session.pipeline[0].id == "parse"
    assert session.static.issues == [] or session.static.issues[0].detected_by


def test_algorithm_registry_points_at_real_files():
    found = list_algorithms()
    assert len(found) >= 8
    assert get_algorithm("runtime.alignment").deterministic is True
    assert get_algorithm("nl.ir_compile").deterministic is False
    for item in found:
        path = ROOT / item.code_location.split(" + ")[0]
        assert path.exists(), item.code_location


def test_semantics_unknown_is_not_full():
    node = _gold().nodes[0]
    sem = lookup(node)
    assert sem.support == "full"
    bogus = node.model_copy(update={"tool": "not_a_real_tool"})
    assert lookup(bogus).support == "unknown"
    cov = coverage_for_ir(_gold().nodes)
    assert cov["unknown_must_not_pass"] is True
