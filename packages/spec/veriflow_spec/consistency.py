from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_spec.models import WorkflowSpec


class SpecIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    constraint_ids: list[str] = Field(default_factory=list)


def check_spec(spec: WorkflowSpec) -> list[SpecIssue]:
    issues: list[SpecIssue] = []
    issues.extend(_order_cycles(spec))
    issues.extend(_unknown_refs(spec))
    issues.extend(_cardinality(spec))
    return issues


def _selectors(spec: WorkflowSpec) -> set[str]:
    names: set[str] = set()
    for item in [*spec.required_actions, *spec.optional_actions]:
        names.add(item.id)
        names.add(item.kind)
        if item.tool:
            names.add(item.tool)
    return names


def _order_cycles(spec: WorkflowSpec) -> list[SpecIssue]:
    pairs = {(item.before, item.after, item.id) for item in spec.ordering_constraints}
    issues: list[SpecIssue] = []
    for before, after, cid in list(pairs):
        reverse = [item for item in spec.ordering_constraints if item.before == after and item.after == before]
        if reverse:
            issues.append(
                SpecIssue(
                    code="SPEC_CONFLICT",
                    message=f"contradictory ordering {before}↔{after}",
                    constraint_ids=[cid, reverse[0].id],
                )
            )
    return issues


def _unknown_refs(spec: WorkflowSpec) -> list[SpecIssue]:
    known = _selectors(spec)
    issues: list[SpecIssue] = []
    for item in spec.ordering_constraints:
        for name in (item.before, item.after):
            if name not in known:
                issues.append(
                    SpecIssue(
                        code="SPEC_UNKNOWN_REF",
                        message=f"ordering {item.id} references unknown {name}",
                        constraint_ids=[item.id],
                    )
                )
    for item in spec.data_dependencies:
        for name in (item.producer, item.consumer):
            if name not in known:
                issues.append(
                    SpecIssue(
                        code="SPEC_UNKNOWN_REF",
                        message=f"dependency {item.id} references unknown {name}",
                        constraint_ids=[item.id],
                    )
                )
    for item in spec.branch_constraints:
        if item.then_action not in known:
            issues.append(
                SpecIssue(
                    code="SPEC_UNKNOWN_REF",
                    message=f"branch {item.id} then_action unknown",
                    constraint_ids=[item.id],
                )
            )
    return issues


def _cardinality(spec: WorkflowSpec) -> list[SpecIssue]:
    by_sel: dict[str, list[str]] = {}
    for item in spec.required_actions:
        key = item.tool or item.kind
        by_sel.setdefault(key, []).append(item.cardinality)
    issues: list[SpecIssue] = []
    for key, cards in by_sel.items():
        if "exactly_one" in cards and "optional" in cards:
            issues.append(
                SpecIssue(
                    code="SPEC_CONFLICT",
                    message=f"impossible cardinality for {key}: exactly_one and optional",
                    constraint_ids=[key],
                )
            )
    return issues
