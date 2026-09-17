from tests.test_submit_api import AC_SOURCE, _login


def test_contestant_cannot_list_users(api_client):
    token = _login(api_client)
    response = api_client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_admin_lists_and_creates_users(api_client):
    token = _login(api_client, "admin", "admin")
    headers = {"Authorization": f"Bearer {token}"}
    listing = api_client.get("/api/admin/users", headers=headers)
    assert listing.status_code == 200, listing.text
    names = {item["username"] for item in listing.json()["users"]}
    assert "demo" in names
    assert "admin" in names
    created = api_client.post(
        "/api/admin/users",
        json={"username": "alice_1", "password": "alicepass", "role": "contestant"},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    assert created.json()["username"] == "alice_1"
    login = api_client.post("/api/auth/login", json={"username": "alice_1", "password": "alicepass"})
    assert login.status_code == 200


def test_admin_can_disable_account(api_client):
    admin = _login(api_client, "admin", "admin")
    headers = {"Authorization": f"Bearer {admin}"}
    created = api_client.post(
        "/api/admin/users",
        json={"username": "bob", "password": "bobpass", "role": "contestant"},
        headers=headers,
    )
    user_id = created.json()["id"]
    paused = api_client.post(
        f"/api/admin/users/{user_id}/disabled",
        json={"disabled": True},
        headers=headers,
    )
    assert paused.status_code == 200, paused.text
    denied = api_client.post("/api/auth/login", json={"username": "bob", "password": "bobpass"})
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "account_disabled"


def test_admin_unpublish_hides_problem(api_client):
    admin = _login(api_client, "admin", "admin")
    headers = {"Authorization": f"Bearer {admin}"}
    hidden = api_client.post(
        "/api/admin/problems/VF1030/publish",
        json={"published": False},
        headers=headers,
    )
    assert hidden.status_code == 200, hidden.text
    public = api_client.get("/api/problems")
    ids = [item["id"] for item in public.json()["problems"]]
    assert "VF1030" not in ids
    bank = api_client.get("/api/admin/problems", headers=headers)
    row = next(item for item in bank.json()["problems"] if item["id"] == "VF1030")
    assert row["published"] is False
    api_client.post(
        "/api/admin/problems/VF1030/publish",
        json={"published": True},
        headers=headers,
    )


def test_me_counts_and_submission_source(api_client):
    token = _login(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    api_client.post(
        "/api/problems/VF1001/submit",
        json={"lang": "python3", "source": AC_SOURCE},
        headers=headers,
    )
    me = api_client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["submissions"] >= 1
    assert me.json()["solved"] >= 1
    listing = api_client.get("/api/submissions", headers=headers).json()["submissions"]
    detail = api_client.get(f"/api/submissions/{listing[0]['id']}", headers=headers)
    assert detail.status_code == 200
    assert "print(sum" in detail.json()["source"]
