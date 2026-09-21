from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

Lang = Literal["python3", "cpp17"]


class SandboxError(RuntimeError):
    """Infrastructure failure; callers must terminate the job as a system error."""

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


@dataclass
class CompileResult:
    ok: bool
    artifact: str | None
    log: str
    time_ms: int


@dataclass
class RunResult:
    verdict: Literal["OK", "TLE", "MLE", "RE"]
    stdout: str
    stderr: str
    time_ms: int
    memory_kb: int | None = None
    detail: str | None = None


class Sandbox(Protocol):
    name: str

    def compile(self, lang: Lang, source: str) -> CompileResult: ...

    def run(
        self,
        lang: Lang,
        artifact: str,
        stdin: str,
        time_limit_ms: int,
        memory_limit_mb: int,
    ) -> RunResult: ...
