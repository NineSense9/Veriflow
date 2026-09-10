from veriflow_verify.issue import Issue


def issues_as_counterexamples(issues: list[Issue]) -> list[dict]:
    return [
        {
            "id": issue.id,
            "code": issue.code,
            "expected": issue.expected,
            "actual": issue.actual,
            "witness_path": issue.witness_path,
            "affected_nodes": issue.affected_nodes,
            "repair_hint": issue.repair_hint,
        }
        for issue in issues
    ]
