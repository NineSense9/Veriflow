from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class AIInvocationTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage: Literal["nl_ir", "repair"]
    requested: bool
    used: bool
    provider: str | None = None
    model: str | None = None
    status: Literal["SUCCESS", "FALLBACK", "NOT_USED", "ERROR", "UNKNOWN"] = "UNKNOWN"
    latency_ms: float | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    retries: int = 0
    request_id: str | None = None
    fallback_reason: str | None = None
    prompt_version: str | None = None


def unknown_trace(stage: Literal["nl_ir", "repair"] = "nl_ir") -> AIInvocationTrace:
    return AIInvocationTrace(
        stage=stage,
        requested=False,
        used=False,
        status="UNKNOWN",
        fallback_reason="provenance unavailable",
    )
