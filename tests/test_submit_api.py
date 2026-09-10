AC_SOURCE = """
n = int(input())
print(sum(map(int, input().split())))
"""

WA_SOURCE = """
n = int(input())
print(n)
"""


def _login(api_client, username="demo", password="demo") -> str:
    response = api_client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


def test_login_rejected(api_client):
    response = api_client.post(
        "/api/auth/login", json={"username": "demo", "password": "nope"}
    )
    assert response.status_code == 401


def test_submit_requires_login(api_client):
    response = api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": AC_SOURCE},
    )
    assert response.status_code == 401


def test_problem_hides_hidden_tests(api_client):
    response = api_client.get("/api/problems/VF1001")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "VF1001"
    assert "签到时长" in body["statement"]
    assert body["public_tests"]
    blob = str(body)
    assert "3000000000" not in blob
    assert "hidden_policy" not in blob


def test_submit_ac_and_status(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    response = api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": AC_SOURCE},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verdict"] == "AC"
    job = api_client.get(f"/api/jobs/{body['job_id']}", headers=headers)
    assert job.status_code == 200
    assert job.json()["verdict"] == "AC"
    listing = api_client.get("/api/submissions", headers=headers)
    assert listing.json()["submissions"][0]["verdict"] == "AC"


def test_submit_wa_counterexample(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    response = api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": WA_SOURCE},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["verdict"] == "WA"
    counter = body["counterexample"]
    assert counter["source"] == "public"
    assert counter["stdin"]
    assert counter["expected"]
    assert counter["actual"]
