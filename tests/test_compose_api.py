import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _login(api_client):
    response = api_client.post(
        "/api/auth/login", json={"username": "demo", "password": "demo"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_compose_example_missing_gate_blocks_publish(api_client):
    headers = _login(api_client)
    created = api_client.post(
        "/api/compose/example", json={"name": "missing_gate"}, headers=headers
    )
    assert created.status_code == 200
    body = created.json()
    assert body["status"] == "blocked"
    assert any(error["code"] == "MISSING_HUMAN_GATE" for error in body["errors"])
    project_id = body["id"]
    gated = api_client.post(
        f"/api/compose/{project_id}/gate",
        json={"decision": "approved"},
        headers=headers,
    )
    assert gated.status_code == 409
    published = api_client.post(
        f"/api/compose/{project_id}/publish", headers=headers
    )
    assert published.status_code == 409


def test_compose_valid_gate_and_publish(api_client):
    headers = _login(api_client)
    created = api_client.post(
        "/api/compose/example", json={"name": "valid_lis"}, headers=headers
    )
    assert created.status_code == 200
    body = created.json()
    assert body["status"] == "checked"
    assert body["errors"] == []
    project_id = body["id"]
    gated = api_client.post(
        f"/api/compose/{project_id}/gate",
        json={"decision": "approved"},
        headers=headers,
    )
    assert gated.status_code == 200
    assert gated.json()["gate_status"] == "approved"
    published = api_client.post(
        f"/api/compose/{project_id}/publish", headers=headers
    )
    assert published.status_code == 200, published.text
    problem_id = published.json()["published_problem_id"]
    assert problem_id.startswith("VF9")
    listing = api_client.get("/api/problems")
    ids = [item["id"] for item in listing.json()["problems"]]
    assert problem_id in ids


def test_compose_nl_missing_gate(api_client):
    headers = _login(api_client)
    created = api_client.post(
        "/api/compose",
        json={"nl": "把题直接入库，不要审题门。"},
        headers=headers,
    )
    assert created.status_code == 200
    assert any(error["code"] == "MISSING_HUMAN_GATE" for error in created.json()["errors"])


def test_weak_bounds_cannot_publish(api_client):
    headers = _login(api_client)
    created = api_client.post(
        "/api/compose/example", json={"name": "missing_bounds"}, headers=headers
    )
    assert created.status_code == 200
    assert created.json()["errors"] == []
    assert any(item["tag"] == "weak_bounds" for item in created.json()["attack"])
    project_id = created.json()["id"]
    api_client.post(
        f"/api/compose/{project_id}/gate",
        json={"decision": "approved"},
        headers=headers,
    )
    published = api_client.post(
        f"/api/compose/{project_id}/publish", headers=headers
    )
    assert published.status_code == 409


def test_verify_and_guarded_repair_endpoints(api_client):
    headers = _login(api_client)
    ir = json.loads((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    verified = api_client.post(
        "/api/verify",
        json={"ir": ir, "nl": "完整出题。"},
        headers=headers,
    )
    assert verified.status_code == 200
    assert verified.json()["status"] == "FAIL"
    repaired = api_client.post(
        "/api/verify-repair",
        json={"ir": ir, "nl": "完整出题。", "max_iterations": 3},
        headers=headers,
    )
    assert repaired.status_code == 200
    body = repaired.json()
    assert body["final"]["status"] == "PASS"
    assert body["improved"] is True
