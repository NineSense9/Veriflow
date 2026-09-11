import json
from pathlib import Path
from types import SimpleNamespace

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.ai_planner import propose_ai_candidates
from veriflow_repair.loop import verify_repair_loop
from veriflow_spec.compiler import compile_spec
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def _missing_gate():
    ir = WorkflowIR.model_validate_json(
        (ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8")
    )
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    before = verify_workflow(ir, spec)
    return ir, spec, before


def _payload(rationale="add a human gate before publish", target="issue-x"):
    return {
        "candidates": [
            {
                "target_issue_id": target,
                "rationale": rationale,
                "patches": [
                    {
                        "operation": "add_node",
                        "node_id": "gate",
                        "kind": "human_gate",
                        "node": {"id": "gate", "kind": "human_gate", "assignee_role": "reviewer"},
                    }
                ],
            }
        ]
    }


def test_ai_candidate_preserves_real_rationale():
    ir, spec, before = _missing_gate()
    rationale = "insert reviewer gate on gen→pub"
    cands, _trace = propose_ai_candidates(
        ir, spec, before.issues, complete_fn=lambda _m: json.dumps(_payload(rationale, before.issues[0].id))
    )
    assert cands
    assert cands[0].rationale == rationale
    assert cands[0].rationale != "ai patch proposal"


def test_ai_candidate_preserves_target_issue():
    ir, spec, before = _missing_gate()
    target = before.issues[0].id
    cands, _trace = propose_ai_candidates(
        ir, spec, before.issues, complete_fn=lambda _m: json.dumps(_payload("why", target))
    )
    assert cands[0].target_issue_id == target


def test_ai_repair_trace_preserves_llm_metadata():
    ir, spec, before = _missing_gate()

    def complete(_messages):
        return SimpleNamespace(
            text=json.dumps(_payload("keep metadata", before.issues[0].id)),
            error=None,
            model="deepseek-chat",
            latency_ms=17.5,
            prompt_tokens=11,
            completion_tokens=22,
            retries=1,
            request_id="req-repair-1",
            fallback_reason=None,
        )

    cands, trace = propose_ai_candidates(ir, spec, before.issues, complete_fn=complete)
    assert cands[0].model == "deepseek-chat"
    assert cands[0].llm_latency_ms == 17.5
    assert cands[0].prompt_tokens == 11
    assert cands[0].completion_tokens == 22
    assert trace.model == "deepseek-chat"
    assert trace.latency_ms == 17.5
    assert trace.prompt_tokens == 11
    assert trace.completion_tokens == 22
    assert trace.retries == 1
    assert trace.request_id == "req-repair-1"


def test_repair_steps_keep_per_iteration_candidates():
    ir, spec, before = _missing_gate()
    report = verify_repair_loop(ir, spec, max_iterations=3, allow_ai=False)
    assert report.steps
    for step in report.steps:
        if step.candidates_evaluated:
            assert step.candidates
            assert step.evaluations
            assert all(ev.candidate_id for ev in step.evaluations)
    if report.selected_candidate_id:
        last = next((step for step in reversed(report.steps) if step.selected_candidate_id), None)
        assert last is not None
        assert last.selected_candidate_id == report.selected_candidate_id
