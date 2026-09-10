import json
from pathlib import Path

from fastapi.testclient import TestClient

from veriflow_api.main import app

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[1]


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["sandbox"] == "unconfigured"


def test_compose_check_missing_gate():
    data = json.loads(
        (ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8")
    )
    response = client.post("/api/compose/check", json=data)
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert any(error["code"] == "MISSING_HUMAN_GATE" for error in body["errors"])


def test_compose_check_valid():
    data = json.loads(
        (ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8")
    )
    response = client.post("/api/compose/check", json=data)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_compose_check_invalid_schema():
    response = client.post("/api/compose/check", json={"name": "nope"})
    assert response.status_code == 422
