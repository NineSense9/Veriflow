"""Explicit, executable problem artifacts; never inferred from workflow text."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Nonempty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class PackageCase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="", max_length=120)
    stdin: str = Field(max_length=1000000)
    stdout: str = Field(max_length=1000000)


class PackageReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lang: Literal["python3", "cpp17"]
    source: Nonempty = Field(max_length=200000)


class PackageLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")
    time_limit_ms: int = Field(default=1000, ge=50, le=10000)
    memory_limit_mb: int = Field(default=256, ge=16, le=1024)


class ProblemPackage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Nonempty = Field(max_length=200)
    statement: Nonempty = Field(max_length=100000)
    input: Nonempty = Field(max_length=10000)
    output: Nonempty = Field(max_length=10000)
    description: str = Field(default="", max_length=10000)
    public_tests: list[PackageCase] = Field(min_length=1, max_length=100)
    hidden_tests: list[PackageCase] = Field(min_length=1, max_length=100)
    reference: PackageReference
    limits: PackageLimits = Field(default_factory=PackageLimits)

    def content_hash(self) -> str:
        content = json.dumps(self.model_dump(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(content.encode("utf-8")).hexdigest()


def load_explicit_template(template_id: str) -> ProblemPackage:
    if template_id != "VF1012":
        raise ValueError("unknown problem package template")
    root = Path(__file__).resolve().parents[3] / "examples" / "problems" / template_id
    spec = json.loads((root / "spec.json").read_text(encoding="utf-8"))
    tests = {}
    for visibility in ("public", "hidden"):
        tests[visibility] = [
            {"name": path.stem, "stdin": path.read_text(encoding="utf-8"), "stdout": path.with_suffix(".out").read_text(encoding="utf-8")}
            for path in sorted((root / "tests" / visibility).glob("*.in"))
        ]
    return ProblemPackage(
        title=spec["title"], statement=(root / "statement.md").read_text(encoding="utf-8"),
        input=spec["signature"]["input"], output=spec["signature"]["output"],
        public_tests=tests["public"], hidden_tests=tests["hidden"],
        reference={"lang": "python3", "source": (root / "ref.py").read_text(encoding="utf-8")},
        limits={"time_limit_ms": spec["time_limit_ms"], "memory_limit_mb": spec["memory_limit_mb"]},
    )


def validate_reference(package: ProblemPackage) -> dict:
    from veriflow_sandbox.factory import get_sandbox
    from veriflow_sandbox.judge import Case, judge_submission

    cases = [Case(item.stdin, item.stdout, visibility, item.name)
             for visibility, group in (("public", package.public_tests), ("hidden", package.hidden_tests))
             for item in group]
    try:
        result = judge_submission(get_sandbox(), package.reference.lang, package.reference.source, cases,
                                  package.limits.time_limit_ms, package.limits.memory_limit_mb)
    except Exception as exc:
        raise PermissionError("package reference validation unavailable") from exc
    if result.verdict != "AC" or result.tests_passed != len(cases) or result.tests_run != len(cases):
        raise PermissionError(f"package reference failed: {result.verdict}")
    return {"verdict": result.verdict, "tests_passed": result.tests_passed, "tests_run": result.tests_run,
            "sandbox": result.sandbox}
