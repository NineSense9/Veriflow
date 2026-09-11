import json
from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.candidate import STAGES, RepairCandidate
from veriflow_repair.select import evaluate_candidate, pick_plan
from veriflow_spec.compiler import compile_spec
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def _login(api_client):
    response = api_client.post("/api/auth/login", json={"username": "demo", "password": "demo"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _missing_gate():
    ir = WorkflowIR.model_validate_json(
        (ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8")
    )
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    before = verify_workflow(ir, spec)
    return ir, spec, before


def test_ai_interpret_disabled_never_calls_llm(api_client, monkeypatch):
    calls = {"n": 0}

    def boom(*_a, **_k):
        calls["n"] += 1
        raise AssertionError("llm called")

    monkeypatch.setattr("veriflow_api.llm.complete", boom)
    headers = _login(api_client)
    response = api_client.post(
        "/api/compose",
        json={"nl": "完整出题：生成器、范围守卫、审题门、入库。", "allow_ai": False},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert calls["n"] == 0
    trace = response.json()["ai_trace"]
    assert trace["status"] == "NOT_USED"
    assert trace["requested"] is False
    assert trace["used"] is False


def test_ai_repair_disabled_never_calls_llm(api_client, monkeypatch):
    calls = {"n": 0}

    def boom(*_a, **_k):
        calls["n"] += 1
        raise AssertionError("llm called")

    monkeypatch.setattr("veriflow_api.llm.complete", boom)
    headers = _login(api_client)
    created = api_client.post(
        "/api/compose/example", json={"name": "missing_gate"}, headers=headers
    )
    assert created.status_code == 200
    project_id = created.json()["id"]
    repaired = api_client.post(
        f"/api/compose/{project_id}/verify-repair",
        json={"allow_ai": False},
        headers=headers,
    )
    assert repaired.status_code == 200, repaired.text
    assert calls["n"] == 0
    report = repaired.json()["repair"]
    assert report["ai_trace"]["status"] == "NOT_USED"
    assert report["ai_trace"]["requested"] is False


def test_ai_candidate_preserves_provenance():
    ir, spec, before = _missing_gate()
    payload = {
        "candidates": [
            {
                "target_issue_id": before.issues[0].id,
                "rationale": "add human gate",
                "patches": [
                    {
                        "operation": "add_node",
                        "node_id": "gate",
                        "kind": "human_gate",
                        "node": {"id": "gate", "kind": "human_gate", "assignee_role": "reviewer"},
                    },
                    {"operation": "connect_nodes", "source": "gen", "target": "gate"},
                    {"operation": "connect_nodes", "source": "gate", "target": "pub"},
                ],
            }
        ]
    }
    from veriflow_repair.ai_planner import propose_ai_candidates

    cands, trace = propose_ai_candidates(
        ir, spec, before.issues, complete_fn=lambda _m: json.dumps(payload)
    )
    assert cands
    assert cands[0].id == "deepseek-01"
    assert cands[0].source == "deepseek"
    assert cands[0].patches
    assert trace.status == "SUCCESS"
    assert trace.stage == "repair"


def test_candidate_evaluation_trace():
    ir, spec, before = _missing_gate()
    _plan, _after, _nxt, decision, stats = pick_plan(ir, spec, before, k=3, allow_ai=False)
    assert stats.evaluations
    for evaluation in stats.evaluations:
        names = [stage.name for stage in evaluation.stages]
        assert names == list(STAGES)
        assert all(stage.status in {"PASS", "FAIL", "SKIPPED"} for stage in evaluation.stages)
    if decision == "REPAIR_ACCEPTED":
        assert stats.selected_candidate_id
        assert stats.selected_candidate_id != "REPAIR_ACCEPTED"
        assert stats.selected_candidate_id.startswith("rule-")


def test_selected_candidate_id():
    ir, spec, before = _missing_gate()
    from veriflow_repair.loop import verify_repair_loop

    report = verify_repair_loop(ir, spec, max_iterations=3, allow_ai=False)
    assert report.final_decision != report.selected_candidate_id or report.selected_candidate_id is None
    if report.improved and report.final.status == "PASS":
        assert report.final_decision == "REPAIR_ACCEPTED"
        assert report.selected_candidate_id
        assert report.selected_candidate_id != "REPAIR_ACCEPTED"
        assert report.selected_candidate_id.startswith("rule-")
        ids = [item.id for item in report.candidates]
        assert report.selected_candidate_id in ids
        eval_ids = [item.candidate_id for item in report.evaluations]
        assert report.selected_candidate_id in eval_ids


def test_failed_guard_marks_downstream_stages_skipped():
    ir, spec, before = _missing_gate()
    empty = RepairCandidate(id="rule-99", source="rule", patches=[], rationale="empty")
    evaluation, after, nxt = evaluate_candidate(ir, spec, before, empty, before.issues[0])
    assert after is None
    assert nxt is None
    assert evaluation.accepted is False
    assert evaluation.stages[0].name == "patch_schema"
    assert evaluation.stages[0].status == "FAIL"
    assert [stage.status for stage in evaluation.stages[1:]] == ["SKIPPED"] * (len(STAGES) - 1)
    assert [stage.name for stage in evaluation.stages] == list(STAGES)


def test_architecture_source_paths_exist():
    data = json.loads((ROOT / "apps/web/data/architecture.json").read_text(encoding="utf-8"))
    assert data["nodes"]
    for node in data["nodes"]:
        assert node["id"]
        assert "x" in node and "y" in node
        for path in node.get("sourcePaths") or []:
            assert (ROOT / path).exists(), path
            assert " " not in path


def test_version_endpoint(api_client, monkeypatch):
    monkeypatch.setenv("VERIFLOW_GIT_COMMIT", "a" * 40)
    monkeypatch.setenv("VERIFLOW_BUILD_TIME", "2026-09-11T00:00:00Z")
    response = api_client.get("/api/version")
    assert response.status_code == 200
    body = response.json()
    assert body["git_commit"] == "a" * 40
    assert body["build_time"] == "2026-09-11T00:00:00Z"
    assert body["app_version"]
    assert body["verifier_version"]


def test_compose_ai_trace_survives_reload(api_client, monkeypatch):
    monkeypatch.setattr(
        "veriflow_api.llm.complete",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("should persist even if unused")),
    )
    headers = _login(api_client)
    created = api_client.post(
        "/api/compose",
        json={"nl": "完整出题：生成器、范围守卫、审题门、入库。", "allow_ai": False},
        headers=headers,
    )
    assert created.status_code == 200
    project_id = created.json()["id"]
    first = created.json()["ai_trace"]
    assert first["status"] == "NOT_USED"
    again = api_client.get(f"/api/compose/{project_id}", headers=headers)
    assert again.status_code == 200
    assert again.json()["ai_trace"]["status"] == "NOT_USED"
    assert again.json()["ai_trace"]["stage"] == "nl_ir"


def test_legacy_null_ai_trace_is_unknown_not_not_used(api_client):
    headers = _login(api_client)
    created = api_client.post(
        "/api/compose/example", json={"name": "valid_lis"}, headers=headers
    )
    assert created.status_code == 200
    project_id = created.json()["id"]
    assert created.json()["ai_trace"]["status"] == "NOT_USED"
    from veriflow_api.db import connect

    with connect() as connection:
        connection.execute(
            "UPDATE compose_projects SET ai_trace_json = NULL WHERE id = ?",
            (project_id,),
        )
        connection.commit()
    again = api_client.get(f"/api/compose/{project_id}", headers=headers)
    assert again.status_code == 200
    trace = again.json()["ai_trace"]
    assert trace["status"] == "UNKNOWN"
    assert trace["status"] != "NOT_USED"
    assert trace["fallback_reason"] == "provenance unavailable"


def test_ai_trace_alter_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv("VERIFLOW_DB", str(tmp_path / "vf.db"))
    from veriflow_api.db import init_db

    init_db()
    init_db()
    from veriflow_api.db import connect

    with connect() as connection:
        cols = [row[1] for row in connection.execute("PRAGMA table_info(compose_projects)").fetchall()]
    assert "ai_trace_json" in cols
