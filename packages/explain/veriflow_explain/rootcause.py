from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_verify.issue import Issue


class RootCauseGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    summary: str
    issue_ids: list[str] = Field(default_factory=list)
    derived_codes: list[str] = Field(default_factory=list)


def primary_cause(issues: list[Issue]) -> Issue | None:
    if not issues:
        return None
    rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    return sorted(issues, key=lambda item: rank[item.severity])[0]


def group_issues(issues: list[Issue]) -> list[RootCauseGroup]:
    """Rule-based symptom grouping. Not causal inference."""
    buckets: dict[tuple[str, ...], list[Issue]] = {}
    for issue in issues:
        key = tuple(sorted(issue.affected_nodes)) or (issue.code,)
        buckets.setdefault(key, []).append(issue)
    groups: list[RootCauseGroup] = []
    for index, (key, items) in enumerate(buckets.items(), start=1):
        codes = [item.code for item in items]
        root = primary_cause(items)
        group_id = f"rc_{index}"
        for item in items:
            item.root_cause_id = group_id
        groups.append(
            RootCauseGroup(
                id=group_id,
                summary=(root.title if root else "grouped symptoms") + f" @ {','.join(key)}",
                issue_ids=[item.id for item in items],
                derived_codes=codes,
            )
        )
    return groups
