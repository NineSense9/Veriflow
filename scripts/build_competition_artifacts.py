"""Copy real docs and experiment outputs. Does not invent metrics."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "competition_artifacts"


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    mapping = {
        "algorithm_summary.md": ROOT / "docs" / "ALGORITHM.md",
        "architecture.md": ROOT / "docs" / "CURRENT_ARCHITECTURE.md",
        "innovation.md": ROOT / "docs" / "INNOVATION.md",
        "application_value.md": ROOT / "docs" / "APPLICATION_VALUE.md",
        "known_limitations.md": ROOT / "docs" / "IMPLEMENTATION_AUDIT.md",
        "deployment.md": ROOT / "docs" / "contest" / "03-部署说明.md",
        "test_report.md": ROOT / "docs" / "contest" / "02-测试报告.md",
    }
    for dest, src in mapping.items():
        if src.exists():
            shutil.copy2(src, OUT / dest)
    demo = OUT / "demo_cases"
    demo.mkdir()
    shutil.copytree(ROOT / "examples" / "golden", demo / "golden")
    shutil.copytree(ROOT / "examples" / "ci", demo / "ci")
    metrics_dir = OUT / "metrics"
    metrics_dir.mkdir()
    smoke = ROOT / "experiments" / "runs" / "smoke"
    if (smoke / "metrics.json").exists():
        shutil.copy2(smoke / "metrics.json", metrics_dir / "metrics.json")
        if (smoke / "report.md").exists():
            shutil.copy2(smoke / "report.md", OUT / "benchmark_report.md")
        if (smoke / "cases.csv").exists():
            shutil.copy2(smoke / "cases.csv", metrics_dir / "cases.csv")
    else:
        (OUT / "benchmark_report.md").write_text(
            "Benchmark not run in this checkout. Run `python -m veriflow_cli bench`.\n",
            encoding="utf-8",
        )
    (OUT / "README.md").write_text(
        "\n".join(
            [
                "# VeriFlow competition artifacts",
                "",
                f"Generated: {datetime.now(timezone.utc).isoformat()}",
                "",
                "Copied from the repository. Metrics are included only if `experiments/runs/smoke` exists.",
                "No synthetic scores were inserted by this script.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": sorted(str(path.relative_to(OUT)).replace("\\", "/") for path in OUT.rglob("*") if path.is_file()),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
