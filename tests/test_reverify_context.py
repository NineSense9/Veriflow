import json

import pytest

from test_report_surface import _login


def create_runtime(api_client, headers):
    response = api_client.post('/api/report/session', json={'demo': 'case4_runtime'}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_reverify_inherits_runtime_conditions(api_client):
    headers = _login(api_client)
    original = create_runtime(api_client, headers)
    response = api_client.post('/api/report/session', headers=headers, json={
        'ir': original['ir'], 'parent_run_id': original['run_id'],
    })
    assert response.status_code == 200, response.text
    repeated = response.json()
    assert repeated['static']['status'] == 'PASS'
    assert repeated['runtime']['status'] == 'FAIL'
    assert repeated['gate']['ready'] == 'BLOCKED'
    assert repeated['runtime_context'] == original['runtime_context']
    assert repeated['spec'] == original['spec']


@pytest.mark.parametrize('change', [{'skip_after': None}, {'nl': '生成题目即可'}, {'demo': 'case1_order'}])
def test_reverify_cannot_silently_change_conditions(api_client, change):
    headers = _login(api_client)
    original = create_runtime(api_client, headers)
    response = api_client.post('/api/report/session', headers=headers, json={
        'ir': original['ir'], 'parent_run_id': original['run_id'], **change,
    })
    assert response.status_code == 409, response.text


def test_legacy_session_remains_readable_but_requires_new_run(api_client):
    headers = _login(api_client)
    original = create_runtime(api_client, headers)
    from veriflow_api.db import connect
    with connect() as connection:
        payload = json.loads(connection.execute('SELECT payload_json FROM verification_runs WHERE id=?', (original['run_id'],)).fetchone()[0])
        payload.pop('runtime_context', None)
        connection.execute('UPDATE verification_runs SET payload_json=? WHERE id=?', (json.dumps(payload), original['run_id']))
        connection.commit()
    assert api_client.get(f"/api/report/runs/{original['run_id']}", headers=headers).status_code == 200
    response = api_client.post('/api/report/session', headers=headers, json={'ir': original['ir'], 'parent_run_id': original['run_id']})
    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'missing_runtime_context'


def test_reverify_parent_must_be_accessible(api_client):
    headers = _login(api_client)
    original = create_runtime(api_client, headers)
    other = _login(api_client, 'setter', 'setter')
    response = api_client.post('/api/report/session', headers=other, json={'ir': original['ir'], 'parent_run_id': original['run_id']})
    assert response.status_code == 404


def test_export_reuses_original_runtime_conditions(api_client):
    headers = _login(api_client)
    original = create_runtime(api_client, headers)
    response = api_client.post('/api/report/export', headers=headers, json={'ir': original['ir'], 'parent_run_id': original['run_id']})
    assert response.status_code == 200
    assert response.json()['json']['gate'] == 'BLOCKED'
    assert response.json()['json']['runtime_fails']


def test_reverify_rejects_removed_interruption_node(api_client):
    headers = _login(api_client)
    original = create_runtime(api_client, headers)
    ir = original['ir']
    skipped = original['runtime_context']['skip_after']
    ir['nodes'] = [node for node in ir['nodes'] if node['id'] != skipped]
    ir['edges'] = [edge for edge in ir['edges'] if edge['from'] != skipped and edge['to'] != skipped]
    response = api_client.post('/api/report/session', headers=headers, json={'ir': ir, 'parent_run_id': original['run_id']})
    assert response.status_code == 409


def test_static_repair_can_pass_with_same_conditions(api_client):
    from veriflow_ir.workflow import WorkflowIR
    from veriflow_spec.models import WorkflowSpec
    from veriflow_repair.loop import verify_repair_loop
    headers = _login(api_client)
    original = api_client.post('/api/report/session', headers=headers, json={'demo': 'case1_order'}).json()
    repaired = verify_repair_loop(WorkflowIR.model_validate(original['ir']), WorkflowSpec.model_validate(original['spec']), allow_ai=False)
    response = api_client.post('/api/report/session', headers=headers, json={'ir': repaired.ir.model_dump(mode='json', by_alias=True), 'parent_run_id': original['run_id']})
    assert response.status_code == 200
    assert response.json()['status'] == 'PASS'
    assert response.json()['gate']['ready'] == 'READY'
    assert response.json()['runtime_context'] == original['runtime_context']


def test_reverify_rejects_repurposed_interruption_node(api_client):
    headers = _login(api_client)
    original = create_runtime(api_client, headers)
    ir = original['ir']
    skipped = original['runtime_context']['skip_after']
    publish = next(node['id'] for node in ir['nodes'] if node.get('tool') == 'publish_problem')
    rename = {skipped: publish, publish: skipped}
    for node in ir['nodes']:
        node['id'] = rename.get(node['id'], node['id'])
    for edge in ir['edges']:
        for key in ('from', 'to'):
            edge[key] = rename.get(edge[key], edge[key])
    response = api_client.post('/api/report/session', headers=headers, json={'ir': ir, 'parent_run_id': original['run_id']})
    assert response.status_code == 409
