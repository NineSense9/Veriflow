from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from veriflow_runtime.models import ConformanceResult
from veriflow_verify.result import VerificationResult


class CrossVerificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pattern: str
    static_status: str
    runtime_status: str
    story: str


def cross_verify(static: VerificationResult, runtime: ConformanceResult) -> CrossVerificationResult:
    pattern = f"STATIC {static.status} + RUNTIME {runtime.status}"
    story = {
        ("PASS", "PASS"): "静态与运行时都符合规格。",
        ("FAIL", "FAIL"): "静态和运行时都失败。",
        ("PASS", "FAIL"): "静态正确不代表运行时符合需求。",
        ("UNKNOWN", "FAIL"): "静态未判定，运行时失败。",
        ("PASS", "UNKNOWN"): "运行时有不可判定约束。",
    }.get((static.status, runtime.status), pattern)
    return CrossVerificationResult(
        pattern=pattern,
        static_status=static.status,
        runtime_status=runtime.status,
        story=story,
    )
