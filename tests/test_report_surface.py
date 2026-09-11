from pathlib import Path


def _login(api_client, username="demo", password="demo") -> dict:
    response = api_client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_bench_latest_flattens_metrics(api_client):
    headers = _login(api_client)
    response = api_client.get("/api/bench/latest", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body.get("n"), int)
    assert body["n"] >= 9
    assert "metrics" in body
    assert body["metrics"]["n"] == body["n"]
    assert str(body.get("source", "")).endswith("metrics.json")
    assert body.get("detection_f1") is not None
    assert body["baselines"]["llm_as_judge"]["status"] == "NOT RUN"
    assert body["baselines"]["veriflow_hybrid"]["detection_f1"] == body["detection_f1"]
    source = Path(body["source"])
    assert source.as_posix() in {
        "experiments/runs/smoke/metrics.json",
        "experiments/runs/dev/metrics.json",
    }


def test_bench_latest_requires_auth(api_client):
    assert api_client.get("/api/bench/latest").status_code == 401


def test_history_counts_runtime_findings(api_client):
    headers = _login(api_client)
    created = api_client.post("/api/report/session", json={"demo": "case4_runtime"}, headers=headers)
    assert created.status_code == 200, created.text
    session = created.json()
    expected = len(session.get("static", {}).get("issues") or []) + len(session.get("runtime_findings") or [])
    assert expected > 0
    history = api_client.get("/api/report/history?limit=20", headers=headers)
    assert history.status_code == 200, history.text
    runs = history.json()["runs"]
    assert runs
    latest = next(item for item in runs if item["id"] == session["run_id"])
    assert latest["issue_count"] == expected


def test_history_derives_issue_count_when_column_stale(api_client):
    headers = _login(api_client)
    created = api_client.post("/api/report/session", json={"demo": "case4_runtime"}, headers=headers)
    assert created.status_code == 200, created.text
    run_id = created.json()["run_id"]
    from veriflow_api.db import connect

    with connect() as connection:
        connection.execute("UPDATE verification_runs SET issue_count = 0 WHERE id = ?", (run_id,))
        connection.commit()
    history = api_client.get("/api/report/history?limit=20", headers=headers)
    latest = next(item for item in history.json()["runs"] if item["id"] == run_id)
    assert latest["issue_count"] > 0
    assert latest["issue_runtime"] > 0
    assert latest["issue_count"] == latest["issue_static"] + latest["issue_runtime"]


def test_parent_run_id_roundtrip(api_client):
    headers = _login(api_client)
    first = api_client.post("/api/report/session", json={"demo": "case1_order"}, headers=headers)
    assert first.status_code == 200, first.text
    parent = first.json()["run_id"]
    child = api_client.post(
        "/api/report/session",
        json={"demo": "case1_order", "parent_run_id": parent},
        headers=headers,
    )
    assert child.status_code == 200, child.text
    assert child.json()["parent_run_id"] == parent
    loaded = api_client.get(f"/api/report/runs/{child.json()['run_id']}", headers=headers)
    assert loaded.json()["parent_run_id"] == parent


def test_report_run_roundtrip(api_client):
    headers = _login(api_client)
    created = api_client.post("/api/report/session", json={"demo": "case1_order"}, headers=headers)
    assert created.status_code == 200, created.text
    run_id = created.json()["run_id"]
    loaded = api_client.get(f"/api/report/runs/{run_id}", headers=headers)
    assert loaded.status_code == 200, loaded.text
    body = loaded.json()
    assert body["run_id"] == run_id
    assert body["ir"]["nodes"]
    names = [item["name"] for item in body["static"]["dimensions"]]
    assert "structural" in names
    assert "semantic" in names
