from pathlib import Path

from veriflow_api.demos import load_demo
from veriflow_verify.result import verify_workflow
from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.compiler import compile_spec

ROOT = Path(__file__).resolve().parents[1]


def test_case4_demo_exposes_golden_issue_and_witness():
    demo = load_demo("case4_runtime")
    golden = (ROOT / "examples/golden/case4_runtime.json").read_text(encoding="utf-8")
    assert demo["expect_static"] == "PASS"
    assert demo["expect_runtime"] == "FAIL"
    assert demo["expect_gate"] == "BLOCKED"
    assert demo["skip_after"] == "if_pay"
    assert demo["issue"]["title"]
    assert demo["witness"][0] == "if_pay"
    assert "if_pay" in golden


def test_verify_workflow_structure_only_skips_safety():
    ir = WorkflowIR.model_validate_json(
        (ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8")
    )
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。", ir.domain)
    full = verify_workflow(ir, spec)
    structural = verify_workflow(ir, spec, dimensions={"structural"})
    assert structural.dimensions
    assert full.verifier_version


def test_miniflow_does_not_hardcode_witness_path():
    text = (ROOT / "apps/web/components/home/VerificationMiniFlow.tsx").read_text(encoding="utf-8")
    assert "if_pay → terminate" not in text
    assert '"BLOCKED"' not in text
    assert '.demo("case4_runtime")' in text or ".demo('case4_runtime')" in text
    css = (ROOT / "apps/web/app/globals.css").read_text(encoding="utf-8")
    assert "var(--ok, #15803d)" not in css
    assert "var(--fail, #b91c1c)" not in css
