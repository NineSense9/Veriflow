import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_eval_script_writes_json():
    completed = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "eval.py")],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    assert "full_verdict" in completed.stdout
    data = json.loads((ROOT / "artifacts" / "eval.json").read_text(encoding="utf-8"))
    assert data["sample_only_verdict"] == "AC"
    assert data["full_verdict"] == "WA"
    assert data["full_counterexample_source"] == "hidden"
