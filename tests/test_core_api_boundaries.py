import json

from test_report_surface import _login


def test_gate_and_session_share_runtime_conditions(api_client):
    headers = _login(api_client)
    original = api_client.post('/api/report/session', headers=headers, json={'demo': 'case4_runtime'}).json()
    gate = api_client.post('/api/gate', headers=headers, json={'ir': original['ir'], 'nl': original['spec']['source_nl'], 'skip_after': original['runtime_context']['skip_after']})
    assert gate.status_code == 200
    assert gate.json()['ready'] == original['gate']['ready'] == 'BLOCKED'


def test_other_user_cannot_read_or_compare_runs(api_client):
    owner = _login(api_client)
    run = api_client.post('/api/report/session', headers=owner, json={'demo': 'case1_order'}).json()['run_id']
    other = _login(api_client, 'setter', 'setter')
    assert api_client.get(f'/api/report/runs/{run}', headers=other).status_code == 404
    assert api_client.post('/api/report/compare', headers=other, json={'left_id': run, 'right_id': run}).status_code == 404


def test_unpublished_problem_and_foreign_job_are_not_readable(api_client):
    from veriflow_api.db import connect
    headers = _login(api_client)
    with connect() as connection:
        connection.execute("INSERT INTO problems(id,spec_json,statement,difficulty,tags,published) VALUES('PRIVATE','{}','private',1,'[]',0)")
        connection.execute("INSERT INTO jobs(id,type,status,error,created_at) VALUES('private-job','submit','failed','private','now')")
        connection.commit()
    assert api_client.get('/api/problems/PRIVATE').status_code == 404
    assert api_client.get('/api/jobs/private-job', headers=headers).status_code == 404


def test_server_records_repair_provenance_with_child_run(api_client):
    headers = _login(api_client)
    original = api_client.post('/api/report/session', headers=headers, json={'demo': 'case1_order'}).json()
    result = api_client.post(f"/api/report/runs/{original['run_id']}/repair", headers=headers, json={'allow_ai': False})
    assert result.status_code == 200, result.text
    repaired = result.json()
    assert repaired['parent_run_id'] == original['run_id']
    assert repaired['gate']['ready'] == 'READY'
    assert repaired['repair']['steps']
    stored = api_client.get(f"/api/report/runs/{repaired['run_id']}", headers=headers).json()
    assert stored['repair'] == repaired['repair']
    assert stored['runtime_context'] == original['runtime_context']
    assert stored['repair_origin']['run_id'] == original['run_id']
    assert stored['repair_origin']['status'] == 'FAIL'
    other = _login(api_client, 'setter', 'setter')
    assert api_client.post(f"/api/report/runs/{original['run_id']}/repair", headers=other, json={'allow_ai': False}).status_code == 404


def test_runtime_only_repair_does_not_create_false_success(api_client):
    headers = _login(api_client)
    original = api_client.post('/api/report/session', headers=headers, json={'demo': 'case4_runtime'}).json()
    result = api_client.post(f"/api/report/runs/{original['run_id']}/repair", headers=headers, json={'allow_ai': False})
    assert result.status_code == 409
    assert result.json()['detail']['code'] == 'runtime_repair_unsupported'


def test_comparison_includes_runtime_findings(api_client):
    headers = _login(api_client)
    failed = api_client.post('/api/report/session', headers=headers, json={'demo': 'case4_runtime'}).json()
    passed = api_client.post('/api/report/session', headers=headers, json={'ir': failed['ir'], 'nl': failed['spec']['source_nl']}).json()
    compared = api_client.post('/api/report/compare', headers=headers, json={'left_id': failed['run_id'], 'right_id': passed['run_id']}).json()
    assert set(compared['resolved']) == {issue['code'] for issue in failed['runtime_findings']}


def test_no_test_data_rejected_before_job_creation(api_client):
    from veriflow_api.db import connect
    headers = _login(api_client)
    with connect() as connection:
        connection.execute("INSERT INTO problems(id,spec_json,statement,difficulty,tags,published) VALUES('EMPTY','{}','empty',1,'[]',1)")
        connection.commit()
    response = api_client.post('/api/problems/EMPTY/submit', headers=headers, json={'lang': 'python3', 'source': 'raise RuntimeError()'})
    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'missing_tests'
    with connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM submissions WHERE problem_id='EMPTY'").fetchone()[0] == 0


def test_sandbox_failure_terminalizes_job(api_client, monkeypatch):
    from veriflow_api.db import connect
    def fail():
        raise RuntimeError('infrastructure detail must not leak')
    monkeypatch.setattr('veriflow_api.main.get_sandbox', fail)
    response = api_client.post('/api/problems/VF1001/submit', headers=_login(api_client), json={'lang': 'python3', 'source': 'print(0)'})
    assert response.status_code == 503
    assert 'infrastructure detail' not in response.text
    with connect() as connection:
        assert connection.execute('SELECT verdict FROM submissions ORDER BY id DESC LIMIT 1').fetchone()[0] == 'SYSTEM_ERROR'
        assert connection.execute('SELECT status FROM jobs ORDER BY created_at DESC LIMIT 1').fetchone()[0] == 'failed'


def test_package_api_ownership_and_real_publication(api_client):
    from test_publish_integrity import package_payload
    owner = _login(api_client)
    project = api_client.post('/api/compose', headers=owner, json={'nl': '完整出题。', 'allow_ai': False}).json()
    pid = project['id']
    assert api_client.post(f'/api/compose/{pid}/gate', headers=owner, json={'decision': 'approved'}).status_code == 409
    uploaded = api_client.post(f'/api/compose/{pid}/package', headers=owner, json=package_payload())
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()['problem_package']['ready']
    other = _login(api_client, 'setter', 'setter')
    assert api_client.get(f'/api/compose/{pid}/package', headers=other).status_code == 404
    assert api_client.post(f'/api/compose/{pid}/package', headers=other, json=package_payload()).status_code == 404
    assert api_client.post(f'/api/compose/{pid}/gate', headers=owner, json={'decision': 'approved'}).status_code == 200
    first = api_client.post(f'/api/compose/{pid}/publish', headers=owner).json()['published_problem_id']
    assert api_client.post(f'/api/compose/{pid}/publish', headers=owner).json()['published_problem_id'] == first
    result = api_client.post(f'/api/problems/{first}/submit', headers=owner, json={'lang': 'python3', 'source': 'raise RuntimeError()'})
    assert result.json()['verdict'] == 'RE'
    assert api_client.post(f'/api/compose/{pid}/package', headers=owner, json=package_payload()).status_code == 409
