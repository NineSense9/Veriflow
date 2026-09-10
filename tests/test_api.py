import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_health(api_client):
    response = api_client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["sandbox"] in {"process", "docker"}


def test_compose_check_missing_gate(api_client):
    data = json.loads(
        (ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8")
    )
    response = api_client.post("/api/compose/check", json=data)
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert any(error["code"] == "MISSING_HUMAN_GATE" for error in body["errors"])


def test_compose_check_valid(api_client):
    data = json.loads(
        (ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8")
    )
    response = api_client.post("/api/compose/check", json=data)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_compose_check_invalid_schema(api_client):
    response = api_client.post("/api/compose/check", json={"name": "nope"})
    assert response.status_code == 422
