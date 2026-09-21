"""Pre-activation checks with a disposable database and no external model calls."""
import os
from pathlib import Path
import tempfile


def main():
    with tempfile.TemporaryDirectory(prefix='vf-release-', ignore_cleanup_errors=True) as directory:
        os.environ.update(VERIFLOW_DB=str(Path(directory) / 'smoke.db'), DEEPSEEK_API_KEY='', VERIFLOW_ENV='test', VERIFLOW_SANDBOX='process', DEMO_PASSWORD='demo', SETTER_PASSWORD='setter')
        from fastapi.testclient import TestClient
        from veriflow_api.main import create_app
        with TestClient(create_app()) as client:
            login = client.post('/api/auth/login', json={'username': 'demo', 'password': 'demo'}); login.raise_for_status()
            client.headers['Authorization'] = 'Bearer ' + login.json()['token']
            runs = {}
            for name in ('case1_order', 'case2_dataflow', 'case3_safety', 'case4_runtime'):
                response = client.post('/api/report/session', json={'demo': name}); response.raise_for_status()
                runs[name] = response.json()
                assert runs[name]['gate']['ready'] == 'BLOCKED', name
            runtime = runs['case4_runtime']
            assert runtime['static']['status'] == 'PASS' and runtime['runtime']['status'] == 'FAIL'
            gate = client.post('/api/gate', json={'ir': runtime['ir'], 'nl': runtime['spec']['source_nl'], 'skip_after': runtime['runtime_context']['skip_after']})
            assert gate.json()['ready'] == 'BLOCKED'
            repaired = client.post(f"/api/report/runs/{runs['case1_order']['run_id']}/repair", json={'allow_ai': False}); repaired.raise_for_status()
            assert repaired.json()['gate']['ready'] == 'READY'
            stored = client.get(f"/api/report/runs/{repaired.json()['run_id']}").json()
            assert stored['repair']['steps']
            draft = client.post('/api/compose/example', json={'name': 'valid_lis'}); draft.raise_for_status()
            pid = draft.json()['id']
            assert client.post(f'/api/compose/{pid}/gate', json={'decision': 'approved'}).status_code == 200
            published = client.post(f'/api/compose/{pid}/publish'); published.raise_for_status()
            problem = published.json()['published_problem_id']
            assert client.post(f'/api/compose/{pid}/publish').json()['published_problem_id'] == problem
            submitted = client.post(f'/api/problems/{problem}/submit', json={'lang': 'python3', 'source': 'raise RuntimeError()'})
            assert submitted.json()['verdict'] == 'RE'
            other = client.post('/api/auth/login', json={'username': 'setter', 'password': 'setter'}).json()
            client.headers['Authorization'] = 'Bearer ' + other['token']
            assert client.get(f"/api/report/runs/{stored['run_id']}").status_code == 404
        print('Release smoke passed: four golden cases, gate, repair history, publish data and isolation.')


if __name__ == '__main__': main()
