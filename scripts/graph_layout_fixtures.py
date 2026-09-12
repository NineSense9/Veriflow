"""Create genuine verifier results using a disposable database for browser layout tests."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    from fastapi.testclient import TestClient
    directory = ROOT / "output/graph-layout"
    directory.mkdir(parents=True, exist_ok=True)
    db_path = directory / "fixtures.db"
    if db_path.exists(): db_path.unlink()
    os.environ.update(VERIFLOW_DB=str(db_path), DEEPSEEK_API_KEY="", VERIFLOW_SANDBOX="process", DEMO_PASSWORD="demo")
    from veriflow_api.main import create_app
    with TestClient(create_app()) as client:
            auth = client.post("/api/auth/login", json={"username": "demo", "password": "demo"})
            auth.raise_for_status()
            client.headers["Authorization"] = "Bearer " + auth.json()["token"]
            cases = {}
            for name in ["case1_order", "case2_dataflow", "case3_safety", "case4_runtime"]:
                response = client.post("/api/report/session", json={"demo": name})
                response.raise_for_status()
                cases[name] = response.json()
            destination = directory / "fixtures.json"
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
            print(f"Created {len(cases)} isolated fixtures")
    try: db_path.unlink()
    except PermissionError: pass

if __name__ == "__main__":
    main()
