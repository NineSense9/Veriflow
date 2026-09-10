from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_verify.bench import run_fault_bench

ROOT = Path(__file__).resolve().parents[1]


def test_fault_bench_smoke(tmp_path):
    ir = WorkflowIR.model_validate_json(
        (ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8")
    )
    metrics = run_fault_bench(ir, tmp_path)
    assert metrics["n"] >= 8
    assert metrics["detection_recall"] >= 0.5
    assert (tmp_path / "metrics.json").exists()
    assert (tmp_path / "cases.csv").exists()
    assert "leaderboard" in (tmp_path / "report.md").read_text(encoding="utf-8")
