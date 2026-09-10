from pathlib import Path

from veriflow_ir.workflow import WorkflowIR

ROOT = Path(__file__).resolve().parents[1]


def test_campus_appendix_parses():
    ir = WorkflowIR.model_validate_json(
        (ROOT / "examples/appendix/reimburse.json").read_text(encoding="utf-8")
    )
    assert ir.domain == "campus"
    assert any(node.tool == "invoice_ocr" for node in ir.nodes)
