from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Cardinality = Literal["exactly_one", "at_least_one", "optional"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class RequiredAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: str
    tool: str | None = None
    cardinality: Cardinality = "at_least_one"
    requirement: str = ""


class OrderingConstraint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    before: str
    after: str
    requirement: str = ""


class BranchConstraint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    condition: str
    then_action: str
    requirement: str = ""


class DataDependency(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    producer: str
    consumer: str
    field: str | None = None
    requirement: str = ""


class SafetyPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal[
        "require_human_gate",
        "require_bounds_guard",
        "no_hardcoded_secret",
        "no_unrestricted_webhook",
    ]
    requirement: str = ""


class SourceTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraint_id: str
    start: int | None = None
    end: int | None = None
    snippet: str = ""
    kind: Literal["nl_span", "platform_policy"] = "platform_policy"


class TemporalConstraint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal[
        "BEFORE",
        "AFTER",
        "EVENTUALLY",
        "NEVER",
        "EXACTLY_ONCE",
        "AT_LEAST_ONCE",
        "AT_MOST_ONCE",
        "IF_EXECUTED_THEN",
        "IF_BRANCH_THEN",
        "DATA_FROM",
    ]
    a: str
    b: str | None = None
    branch: Literal["true", "false"] | None = None
    requirement: str = ""


class WorkflowSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spec_version: Literal["1.0"] = "1.0"
    domain: Literal["compose", "campus"]
    goal: str
    source_nl: str = ""
    required_actions: list[RequiredAction] = Field(default_factory=list)
    optional_actions: list[RequiredAction] = Field(default_factory=list)
    ordering_constraints: list[OrderingConstraint] = Field(default_factory=list)
    branch_constraints: list[BranchConstraint] = Field(default_factory=list)
    data_dependencies: list[DataDependency] = Field(default_factory=list)
    safety_policies: list[SafetyPolicy] = Field(default_factory=list)
    temporal_constraints: list[TemporalConstraint] = Field(default_factory=list)
    source_traces: list[SourceTrace] = Field(default_factory=list)
    compiler: str = "heuristic"
    compiler_basis: Literal["empty", "keyword", "platform_template"] = "platform_template"
    evidence: list[str] = Field(default_factory=list)
