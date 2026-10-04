"""Copy real docs and experiment outputs. Does not invent metrics."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "competition_artifacts"


def main() -> int:
    preserved: list[tuple[str, bytes]] = []
    if OUT.exists():
        for path in OUT.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                preserved.append((str(path.relative_to(OUT)).replace("\\", "/"), path.read_bytes()))
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    mapping = {
        "algorithm_summary.md": ROOT / "docs" / "ALGORITHM.md",
        "architecture.md": ROOT / "docs" / "CURRENT_ARCHITECTURE.md",
        "innovation.md": ROOT / "docs" / "INNOVATION.md",
        "application_value.md": ROOT / "docs" / "APPLICATION_VALUE.md",
        "known_limitations.md": ROOT / "docs" / "IMPLEMENTATION_AUDIT.md",
        "deployment.md": ROOT / "docs" / "contest" / "05-安装部署.md",
        "test_report.md": ROOT / "docs" / "contest" / "04-功能测试报告.md",
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
    bench = ROOT / "experiments" / "runs" / "competition"
    if (bench / "metrics.json").exists():
        for name in ("metrics.json", "ablation.json", "llm_judge.json", "cases.csv", "cases.json"):
            source = bench / name
            if source.exists():
                shutil.copy2(source, metrics_dir / name)
        readme = bench / "README.md"
        if readme.exists():
            shutil.copy2(readme, OUT / "benchmark_report.md")
    else:
        (OUT / "benchmark_report.md").write_text(
            "Competition benchmark not run in this checkout. Run `python scripts/competition_benchmark.py`.\n",
            encoding="utf-8",
        )
    for relative, payload in preserved:
        target = OUT / relative
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    (OUT / "README.md").write_text(
        "\n".join(
            [
                "# VeriFlow competition artifacts",
                "",
                f"Generated: {datetime.now(timezone.utc).isoformat()}",
                "",
                "Copied from the repository. Metrics come from `experiments/runs/competition` when that run exists.",
                "Smoke results are not copied. No synthetic scores were inserted by this script.",
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
