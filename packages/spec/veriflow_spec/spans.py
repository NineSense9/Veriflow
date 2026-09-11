from __future__ import annotations

from veriflow_spec.models import SourceTrace


def span(text: str, constraint_id: str, *needles: str) -> SourceTrace:
    hay = text or ""
    for needle in needles:
        if not needle:
            continue
        index = hay.find(needle)
        if index < 0:
            index = hay.lower().find(needle.lower())
        if index >= 0:
            return SourceTrace(
                constraint_id=constraint_id,
                start=index,
                end=index + len(needle),
                snippet=hay[index : index + len(needle)],
                kind="nl_span",
            )
    return SourceTrace(constraint_id=constraint_id, kind="platform_policy")
