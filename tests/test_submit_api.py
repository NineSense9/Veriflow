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


def test_me_requires_login(api_client):
    assert api_client.get("/api/auth/me").status_code == 401
    token = _login(api_client)
    response = api_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "demo"


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


def test_stress_mismatch(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    kit = api_client.get("/api/problems/VF1001/kit", headers=headers)
    assert kit.status_code == 200
    assert kit.json()["has_brute"] is True
    response = api_client.post(
        "/api/problems/VF1001/stress",
        headers=headers,
        json={
            "sol_lang": "python3",
            "sol_source": WA_SOURCE,
            "gen_source": "print(3)\nprint('1 2 3')\n",
            "rounds": 5,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "mismatch"
    assert body["counterexample"]["source"] == "stress"
    assert body["counterexample"]["stdin"]


def test_stress_requires_login(api_client):
    response = api_client.post(
        "/api/problems/VF1001/stress",
        json={"sol_lang": "python3", "sol_source": AC_SOURCE, "rounds": 1},
    )
    assert response.status_code == 401


def test_solve_draft_submits(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    response = api_client.post(
        "/api/problems/VF1001/solve",
        json={"lang": "python3"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["solver"] in {"fallback", "deepseek"}
    assert body["source"]
    assert body["verdict"] in {"CE", "WA", "TLE", "RE", "AC", "MLE"}


def test_mutate_vf1001(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    response = api_client.post("/api/problems/VF1001/mutate", headers=headers)
    assert response.status_code == 200
    rate = response.json()["kill_rate"]
    assert rate is not None
    assert 0 < rate <= 1


def test_tutor_on_wa(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    submitted = api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": WA_SOURCE},
        headers=headers,
    )
    assert submitted.json()["verdict"] == "WA"
    response = api_client.post(
        "/api/problems/VF1001/tutor",
        json={"submission_id": submitted.json()["submission_id"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["question"]
    assert "```" not in body["question"]
    assert "标准答案" not in body["question"]


def test_tutor_rejects_ac(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    submitted = api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": AC_SOURCE},
        headers=headers,
    )
    assert submitted.json()["verdict"] == "AC"
    response = api_client.post(
        "/api/problems/VF1001/tutor",
        json={"submission_id": submitted.json()["submission_id"]},
        headers=headers,
    )
    assert response.status_code == 400


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


def test_contrast_rejects_ac(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    submitted = api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": AC_SOURCE},
        headers=headers,
    )
    response = api_client.post(
        "/api/problems/VF1001/contrast",
        json={"submission_id": submitted.json()["submission_id"]},
        headers=headers,
    )
    assert response.status_code == 400


def test_contrast_wa_falls_back_to_brute(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    submitted = api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": WA_SOURCE},
        headers=headers,
    )
    assert submitted.json()["verdict"] == "WA"
    response = api_client.post(
        "/api/problems/VF1001/contrast",
        json={"submission_id": submitted.json()["submission_id"]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["solver"] in {"brute", "deepseek"}
    assert body["reference_source"]
    assert "print(n)" in body["user_source"]
    assert body["note"]
