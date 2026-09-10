from veriflow_verify.issue import Issue


def primary_cause(issues: list[Issue]) -> Issue | None:
    if not issues:
        return None
    rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    return sorted(issues, key=lambda item: rank[item.severity])[0]
