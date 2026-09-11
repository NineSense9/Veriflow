from __future__ import annotations

import json
import os
import re
from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_staticcheck.check import CheckError, check_workflow

ROOT = Path(__file__).resolve().parents[3]
EXAMPLES = ROOT / "examples" / "compose"
PROMPT = ROOT / "prompts" / "compiler_compose.txt"


def load_example(name: str) -> WorkflowIR:
    path = EXAMPLES / f"{name}.json"
    return WorkflowIR.model_validate_json(path.read_text(encoding="utf-8"))


def fallback_compile(nl: str, errors: list[CheckError] | None = None) -> WorkflowIR:
    text = nl.strip()
    codes = {item.code for item in (errors or [])}
    if codes & {"MISSING_HUMAN_GATE"} and any(k in text for k in ("审题", "人工", "human")):
        return load_example("valid_lis")
    if any(k in text for k in ("没有人工", "缺审题", "跳过审题", "直接入库", "无人工门")):
        return load_example("missing_gate")
    if any(
        k in text
        for k in ("没有范围", "缺守卫", "不上界", "没有上界", "弱测资", "不要写数据范围", "不要范围")
    ):
        return load_example("missing_bounds")
    if "看起来" in text or "感觉对" in text:
        ir = load_example("valid_lis")
        dumped = ir.model_dump(by_alias=True)
        for node in dumped["nodes"]:
            if node["kind"] == "guard":
                node["expr"] = "金额看起来对"
        return WorkflowIR.model_validate(dumped)
    return load_example("valid_lis")


def compile_nl(nl: str, errors: list[CheckError] | None = None) -> tuple[WorkflowIR, str]:
    """Return IR and backend name: deepseek | fallback."""
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        try:
            return _deepseek_compile(nl, errors, key), "deepseek"
        except Exception:
            pass
    return fallback_compile(nl, errors), "fallback"


def _deepseek_compile(nl: str, errors: list[CheckError] | None, key: str) -> WorkflowIR:
    import httpx

    system = PROMPT.read_text(encoding="utf-8")
    user = nl
    if errors:
        payload = [item.model_dump() for item in errors]
        user += "\n\n上次静态检查失败，请修复后只输出完整 IR JSON：\n" + json.dumps(
            payload, ensure_ascii=False
        )
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
    last_error: Exception | None = None
    for _ in range(3):
        response = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            },
            timeout=45.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        try:
            ir = _parse_ir(content)
            return ir
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            user = f"{nl}\n\n上次 JSON 不合格：{exc}\n请只输出符合 Schema 的 IR。"
    raise last_error or ValueError("compile failed")


def _parse_ir(text: str) -> WorkflowIR:
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", stripped, re.S)
    if fence:
        stripped = fence.group(1)
    payload = json.loads(stripped)
    if not isinstance(payload, dict):
        raise ValueError("IR must be an object")
    return WorkflowIR.model_validate(_coerce_ir(payload))


def _coerce_ir(payload: dict) -> dict:
    out = dict(payload)
    out.setdefault("ir_version", "1.0")
    out.setdefault("domain", "compose")
    out.setdefault("name", "compiled")
    if not str(out.get("name") or "").strip():
        out["name"] = "compiled"
    nodes = []
    for raw in out.get("nodes") or []:
        if not isinstance(raw, dict):
            continue
        node = dict(raw)
        extra = node.pop("params", None)
        if isinstance(extra, dict):
            config = dict(node.get("config") or {})
            config.update(extra)
            node["config"] = config
        allowed = {
            "id",
            "kind",
            "tool",
            "expr",
            "on_fail",
            "assignee_role",
            "in_type",
            "out_type",
            "config",
        }
        nodes.append({key: node[key] for key in allowed if key in node})
    out["nodes"] = nodes
    edges = []
    for raw in out.get("edges") or []:
        if not isinstance(raw, dict):
            continue
        source = raw.get("from") or raw.get("from_") or raw.get("source")
        target = raw.get("to") or raw.get("target")
        if source and target:
            item = {"from": source, "to": target}
            if raw.get("branch") in {"true", "false"}:
                item["branch"] = raw["branch"]
            edges.append(item)
    out["edges"] = edges
    keep = {"ir_version", "domain", "name", "nodes", "edges"}
    return {key: out[key] for key in keep if key in out}
