from __future__ import annotations

import json
import os
import re
from pathlib import Path

from veriflow_sandbox.factory import SandboxUnavailable, get_sandbox
from veriflow_sandbox.judge import Case, judge_submission

ROOT = Path(__file__).resolve().parents[3]
PROMPT = ROOT / "prompts" / "contrast.txt"


def extract_json(text: str) -> dict | None:
    raw = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.S)
    if fence:
        raw = fence.group(1)
    else:
        match = re.search(r"\{.*\}", raw, re.S)
        if match:
            raw = match.group(0)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    source = data.get("source")
    if not isinstance(source, str) or not source.strip():
        return None
    guess = data.get("guess")
    return {"source": source.strip() + "\n", "guess": guess.strip() if isinstance(guess, str) else ""}


def propose_aligned(user_source: str, statement: str, lang: str, counterexample: dict) -> tuple[str | None, str, str]:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not key:
        return None, "not_configured", ""
    try:
        payload = _deepseek_contrast(user_source, statement, lang, counterexample, key)
    except Exception:
        return None, "deepseek_error", ""
    if not payload:
        return None, "deepseek_error", ""
    return payload["source"], "deepseek", payload["guess"]


def _deepseek_contrast(user_source: str, statement: str, lang: str, counterexample: dict, key: str) -> dict | None:
    import httpx

    system = PROMPT.read_text(encoding="utf-8")
    label = "Python 3" if lang == "python3" else "C++17"
    user = (
        f"语言：{label}\n题面：\n{statement[:3500]}\n\n"
        f"用户代码：\n{user_source[:8000]}\n\n"
        f"反例 stdin：\n{(counterexample.get('stdin') or '')[:1500]}\n"
        f"期望：\n{(counterexample.get('expected') or '')[:500]}\n"
        f"用户实际：\n{(counterexample.get('actual') or '')[:500]}\n"
    )
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
    response = httpx.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        },
        timeout=45.0,
    )
    response.raise_for_status()
    content = (response.json()["choices"][0]["message"]["content"] or "").strip()
    return extract_json(content)


def passes_tests(lang: str, source: str, tests: list[Case], time_limit_ms: int, memory_limit_mb: int) -> bool:
    try:
        sandbox = get_sandbox()
    except SandboxUnavailable:
        return False
    result = judge_submission(sandbox, lang, source, tests, time_limit_ms, memory_limit_mb)
    return result.verdict == "AC"


def ce_case(counterexample: dict) -> Case:
    return Case(
        stdin=counterexample.get("stdin") or "",
        stdout=counterexample.get("expected") or "",
        visibility="public",
        name="contrast-ce",
    )
