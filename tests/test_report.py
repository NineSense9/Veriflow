from fastapi.testclient import TestClient


def test_sets_public(api_client: TestClient):
    response = api_client.get("/api/sets")
    assert response.status_code == 200
    sets = response.json()["sets"]
    assert len(sets) == 6
    assert sets[0]["ids"][0] == "VF1001"


def test_report_requires_login(api_client: TestClient):
    assert api_client.get("/api/report/summary").status_code == 401
