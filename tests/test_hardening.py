import json
from pathlib import Path

from veriflow_explain.rootcause import group_issues
from veriflow_ir.workflow import WorkflowIR
from veriflow_mutate.ir_faults import InvalidMutation, mutate_ir
from veriflow_repair.guard import validate_patches
from veriflow_repair.patch import Patch
from veriflow_repair.loop import verify_repair_loop
from veriflow_spec.compiler import compile_spec
from veriflow_spec.consistency import check_spec
from veriflow_spec.models import OrderingConstraint, WorkflowSpec
from veriflow_spec.stability import spec_stability
from veriflow_verify.bundle import evidence_bundle
from veriflow_verify.metamorphic import consistent
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def test_spec_conflict_ordering():
    spec = compile_spec("完整出题。")
    spec.ordering_constraints.append(
        OrderingConstraint(id="bad", before="publish_problem", after="human_gate", requirement="reverse")
    )
    codes = {item.code for item in check_spec(spec)}
    assert "SPEC_CONFLICT" in codes


def test_spec_stability_heuristic():
    report = spec_stability("完整出题：生成器、范围守卫、审题门、入库。")
    assert report["mean"]["constraint_agreement"] >= 0.5


def test_metamorphic_rename_stable():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    assert consistent(ir, spec)


def test_patch_precondition_rejects_missing_edge():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))
    ok, reason = validate_patches(ir, [Patch(operation="disconnect_nodes", source="nope", target="pub")])
    assert ok is False
    assert "missing" in reason


def test_repair_rollback_on_empty_plan_is_explicit():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    report = verify_repair_loop(ir, spec, max_iterations=2)
    assert report.iterations == 0
    assert report.final.status == "PASS"


def test_mutation_must_change_graph():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))
    mutated = mutate_ir(ir, "orphan_node")
    assert mutated.ir.node_map()["orphan"].kind == "transform"
    try:
        mutate_ir(ir, "not_a_fault")
    except ValueError:
        pass
    else:
        raise AssertionError("unknown fault")


def test_invalid_mutation_class_exists():
    assert issubclass(InvalidMutation, ValueError)


def test_evidence_bundle_is_not_a_proof():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题。")
    result = verify_workflow(ir, spec)
    bundle = evidence_bundle(ir, spec, result)
    assert bundle["not_a_formal_proof"] is True
    assert bundle["workflow_hash"]


def test_root_cause_groups_symptoms():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题。")
    result = verify_workflow(ir, spec)
    groups = group_issues(result.issues)
    assert groups
    assert all(item.root_cause_id for item in result.issues)


def test_golden_cases():
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    for name, extra in (
        ("case1_order.json", None),
        ("case2_dataflow.json", None),
        ("case3_safety.json", None),
    ):
        payload = json.loads((ROOT / "examples/golden" / name).read_text(encoding="utf-8"))
        ir = WorkflowIR.model_validate(payload["ir"])
        result = verify_workflow(ir, spec)
        codes = {issue.code for issue in result.issues}
        for expected in payload["expect_fail"]:
            assert expected in codes, (name, codes)
        if name == "case3_safety.json":
            assert result.dimensions
            struct = next(item for item in result.dimensions if item.name == "structural")
            assert struct.status == "PASS"
        if name == "case1_order.json":
            report = verify_repair_loop(ir, spec, max_iterations=3)
            assert report.final.status == "PASS"
            assert report.patch_operations >= 1
