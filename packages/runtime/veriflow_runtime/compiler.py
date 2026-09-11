"""Compile TemporalConstraint into a small deterministic monitor program.

Not LTL. Each rule is checked by the monitor with a single pass over the trace.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from veriflow_spec.models import TemporalConstraint, WorkflowSpec


class MonitorRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraint_id: str
    kind: str
    a: str
    b: str | None = None
    branch: str | None = None
    requirement: str = ""


def compile_temporal(spec: WorkflowSpec) -> list[MonitorRule]:
    rules: list[MonitorRule] = []
    for item in spec.temporal_constraints:
        rules.append(_from_constraint(item))
    return rules


def _from_constraint(item: TemporalConstraint) -> MonitorRule:
    return MonitorRule(
        constraint_id=item.id,
        kind=item.kind,
        a=item.a,
        b=item.b,
        branch=item.branch,
        requirement=item.requirement or item.kind,
    )
