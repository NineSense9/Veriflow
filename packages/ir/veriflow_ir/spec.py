from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Language = Literal["cpp17", "python3"]
HiddenPolicy = Literal["attacker+bank", "bank", "attacker"]


class Signature(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: str
    output: str


class PublicTest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stdin: str
    stdout: str


class ProblemSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ir_version: Literal["1.0"]
    id: str
    title: str
    tags: list[str]
    difficulty: int
    languages: list[Language]
    time_limit_ms: int
    memory_limit_mb: int
    signature: Signature
    pre: list[str] = Field(default_factory=list)
    post: list[str] = Field(default_factory=list)
    invariants: list[str] = Field(default_factory=list)
    public_tests: list[PublicTest] = Field(default_factory=list)
    hidden_policy: HiddenPolicy = "attacker+bank"
    has_brute: bool = False
    forbidden: list[str] = Field(default_factory=list)
