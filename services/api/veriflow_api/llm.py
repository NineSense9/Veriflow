from __future__ import annotations

import json
import os
import time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LLMResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = ""
    provider: str = "deepseek"
    model: str = ""
    latency_ms: float = 0
    retries: int = 0
    error: str | None = None
    fallback_reason: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    request_id: str | None = None


def complete(
    messages: list[dict[str, str]],
    *,
    json_object: bool = True,
    temperature: float = 0.2,
    timeout: float = 45.0,
    max_retries: int = 2,
) -> LLMResult:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    if not key:
        return LLMResult(model=model, error="no_api_key", fallback_reason="DEEPSEEK_API_KEY unset")
    try:
        import httpx
    except ImportError:
        return LLMResult(model=model, error="httpx_missing", fallback_reason="httpx not installed")
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if json_object:
        payload["response_format"] = {"type": "json_object"}
    last_error = "unknown"
    started = time.perf_counter()
    for attempt in range(max_retries + 1):
        try:
            response = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
                timeout=timeout,
            )
            response.raise_for_status()
            body = response.json()
            usage = body.get("usage") or {}
            text = body["choices"][0]["message"]["content"] or ""
            return LLMResult(
                text=text,
                model=model,
                latency_ms=round((time.perf_counter() - started) * 1000, 3),
                retries=attempt,
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                request_id=response.headers.get("x-request-id") or body.get("id"),
            )
        except Exception as exc:  # noqa: BLE001
            last_error = type(exc).__name__
    return LLMResult(
        model=model,
        latency_ms=round((time.perf_counter() - started) * 1000, 3),
        retries=max_retries,
        error=last_error,
        fallback_reason=last_error,
    )


def parse_json_object(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.startswith("json"):
            stripped = stripped[4:]
    return json.loads(stripped)
