from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.ambiguity import analyze_requirement
from veriflow_spec.compiler import compile_spec
from veriflow_verify.egraph import build_graph
from veriflow_verify.export import export_markdown
from veriflow_verify.pipeline import run_session
from veriflow_verify.sdk import run_algorithm
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def test_ambiguity_vague_is_not_clear():
    report = analyze_requirement("天气不好时提醒我")
    assert report.status == "AMBIGUOUS"
    assert report.method == "Deterministic"
    assert any("天气不好" in item.snippet or "天气不好" in item.reason for item in report.items)


def test_ambiguity_clear_compose():
    report = analyze_requirement("完整出题：生成器、范围守卫、审题门、入库。")
    assert report.status == "CLEAR"


def test_source_span_hits_nl():
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    traces = {item.constraint_id: item for item in spec.source_traces}
    assert traces["act_gen"].kind == "nl_span"
    assert traces["act_gen"].snippet
    assert spec.compiler_basis in {"keyword", "platform_template"}


def test_evidence_graph_why_chain_missing_gate():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题。")
    static = verify_workflow(ir, spec)
    graph = build_graph(run_id="t", spec=spec, ir=ir, static=static)
    issue = next(item for item in graph.entities if item.type == "Issue")
    chain = graph.why(issue.id)
    steps = {item["step"] for item in chain}
    assert "verdict" in steps
    nb = graph.neighborhood(issue.id, hops=2)
    assert nb.entities
    assert all(rel.relation_type for rel in graph.relations)


def test_sdk_graph_integrity_matches_staticcheck():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    out = run_algorithm("graph.integrity", {"ir": ir})
    assert out["ok"] is True
    assert "MISSING_HUMAN_GATE" in out["result"]["codes"]
    assert out["health"]["deterministic"] is True


def test_restore_spine_repairs_wrong_order():
    from veriflow_mutate.ir_faults import mutate_ir
    from veriflow_repair.loop import verify_repair_loop
    from veriflow_spec.compiler import compile_spec

    gold = WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    mutated = mutate_ir(gold, "wrong_order")
    report = verify_repair_loop(mutated.ir, spec, max_iterations=3)
    assert report.repair_mode == "PATCH"
    assert report.final.status == "PASS"


def test_case4_runtime_findings_and_export():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/golden/case4_runtime_ir.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。当 payment_status == success 时发送通知。")
    session = run_session(ir, spec, nl=spec.source_nl, skip_after="if_pay")
    assert session.runtime_findings
    assert session.graph is not None
    assert session.ambiguity is not None
    md = export_markdown(session)
    assert "Evidence Report" in md
    assert "sk-" not in md.lower() or "[redacted]" in md
