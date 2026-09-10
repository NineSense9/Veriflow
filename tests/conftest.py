from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def repo_root() -> Path:
    return ROOT


@pytest.fixture()
def api_client(tmp_path, monkeypatch):
    monkeypatch.setenv("VERIFLOW_DB", str(tmp_path / "vf.db"))
    monkeypatch.setenv("VERIFLOW_SANDBOX", "process")
    monkeypatch.setenv("DEMO_PASSWORD", "demo")
    monkeypatch.setenv("SETTER_PASSWORD", "setter")
    from veriflow_api.main import create_app

    with TestClient(create_app()) as client:
        yield client
