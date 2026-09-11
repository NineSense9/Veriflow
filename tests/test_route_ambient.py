import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_route_ambient_resolver_is_the_typescript_module():
    node = shutil.which("node") or shutil.which("node.exe")
    assert node
    run = subprocess.run(
        [node, "--experimental-strip-types", str(ROOT / "tests" / "route_ambient_selftest.mts")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert run.returncode == 0, run.stdout + run.stderr
    assert "route-ambient ok" in run.stdout
