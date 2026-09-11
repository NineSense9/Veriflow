from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TraceStatus = Literal["success", "error", "mocked", "blocked", "skipped"]
EffectClass = Literal[
    "PURE",
    "READ_ONLY",
    "CONTROL_FLOW",
    "EXTERNAL_WRITE",
    "DESTRUCTIVE",
    "UNKNOWN_SIDE_EFFECT",
]


class TraceEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_index: int
    timestamp_ms: int = 0
    node_id: str
    node_type: str
    operation: str
    input_summary: str = ""
    output_summary: str = "redacted"
    branch: str | None = None
    status: TraceStatus = "success"
    duration_ms: int = 0
    error: str | None = None
    external_effect: str | None = None


class ExecutionTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trace_id: str
    workflow_id: str
    workflow_hash: str = ""
    source: Literal["sandbox", "mock", "n8n"] = "mock"
    start_time: str = ""
    end_time: str = ""
    status: Literal["completed", "failed", "blocked"] = "completed"
    node_count: int = 0
    events: list[TraceEvent] = Field(default_factory=list)


class TraceCounterexample(BaseModel):
    model_config = ConfigDict(extra="forbid")

    violation_index: int | None = None
    expected: str
    observed: str
    expected_predecessor: str | None = None
    actual_predecessor: str | None = None
    slice_labels: list[str] = Field(default_factory=list)


class ConformanceIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraint_id: str
    status: Literal["PASS", "FAIL", "UNKNOWN"]
    expected: str
    observed: str
    violation_index: int | None = None
    affected_nodes: list[str] = Field(default_factory=list)
    trace_slice: list[int] = Field(default_factory=list)
    counterexample: TraceCounterexample | None = None
    method: str = "RUNTIME"


class ConformanceResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["PASS", "FAIL", "UNKNOWN"]
    issues: list[ConformanceIssue] = Field(default_factory=list)
    node_coverage: float = 0.0
    required_action_coverage: float = 0.0
    constraint_runtime_coverage: float = 0.0
    branch_coverage: float = 0.0
    verifiable: int = 0
    total: int = 0
    unknown: int = 0
