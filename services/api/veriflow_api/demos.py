from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

DEMOS = [
    {
        "id": "case1_order",
        "title": "顺序失败",
        "file": "examples/golden/case1_order.json",
        "kind": "static FAIL",
    },
    {
        "id": "case2_dataflow",
        "title": "数据流失败",
        "file": "examples/golden/case2_dataflow.json",
        "kind": "static FAIL",
    },
    {
        "id": "case3_safety",
        "title": "安全策略失败",
        "file": "examples/golden/case3_safety.json",
        "kind": "static FAIL",
    },
    {
        "id": "case4_runtime",
        "title": "静态通过 · 运行失败",
        "file": "examples/golden/case4_runtime.json",
        "kind": "runtime FAIL",
    },
]


def list_demos() -> list[dict]:
    return [{k: item[k] for k in ("id", "title", "kind")} for item in DEMOS]


def load_demo(demo_id: str) -> dict:
    meta = next((item for item in DEMOS if item["id"] == demo_id), None)
    if meta is None:
        raise KeyError(demo_id)
    payload = json.loads((ROOT / meta["file"]).read_text(encoding="utf-8"))
    ir = payload.get("ir")
    if not ir and payload.get("workflow"):
        ir = json.loads((ROOT / payload["workflow"]).read_text(encoding="utf-8"))
    return {
        "id": demo_id,
        "title": payload.get("title") or meta["title"],
        "nl": payload.get("nl") or "",
        "ir": ir,
        "skip_after": payload.get("skip_after"),
        "expect_static": payload.get("expect_static") or payload.get("expect_fail"),
        "expect_runtime": payload.get("expect_runtime"),
        "expect_gate": payload.get("expect_gate"),
        "expect_pattern": payload.get("expect_pattern"),
        "story": payload.get("story") or "",
        "issue": payload.get("issue"),
        "witness": payload.get("witness") or [],
        "kind": meta["kind"],
    }
