from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from veriflow_repair.patch import Patch
from veriflow_verify.ai_trace import AIInvocationTrace

StageName = Literal[
    "patch_schema",
    "graph_integrity",
    "policy_whitelist",
    "incremental_screening",
    "full_verification",
    "regression_decision",
]
STAGES: tuple[StageName, ...] = (
    "patch_schema",
    "graph_integrity",
    "policy_whitelist",
    "incremental_screening",
    "full_verification",
    "regression_decision",
)


class RepairCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source: Literal["rule", "deepseek"]
    model: str | None = None
    prompt_version: str | None = None
    target_issue_id: str | None = None
    rationale: str = ""
    patches: list[Patch] = Field(default_factory=list)
    llm_latency_ms: float | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    fallback_reason: str | None = None


class GuardStageResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: StageName
    status: Literal["PASS", "FAIL", "SKIPPED"]
    reason: str = ""
    latency_ms: float | None = None


class CandidateEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_id: str
    stages: list[GuardStageResult] = Field(default_factory=list)
    accepted: bool = False
    reject_reason: str | None = None


def skip_rest(done: list[GuardStageResult], from_index: int, reason: str) -> list[GuardStageResult]:
    out = list(done)
    for name in STAGES[from_index:]:
        out.append(GuardStageResult(name=name, status="SKIPPED", reason=reason))
    return out
