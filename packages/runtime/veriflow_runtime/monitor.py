from __future__ import annotations

from veriflow_runtime.compiler import MonitorRule, compile_temporal
from veriflow_runtime.evidence import counterexample, slice_around
from veriflow_runtime.models import ConformanceIssue, ConformanceResult, ExecutionTrace
from veriflow_spec.models import WorkflowSpec


def _hits(trace: ExecutionTrace, selector: str) -> list[int]:
    found: list[int] = []
    for event in trace.events:
        if event.status not in {"success", "mocked"}:
            continue
        if selector not in {event.node_id, event.node_type, event.operation}:
            continue
        # Every completed event is an execution. The trace schema has no start
        # events, so deduplicating by node would hide retries and repeated writes.
        found.append(event.event_index)
    return found


def monitor_trace(trace: ExecutionTrace, spec: WorkflowSpec) -> ConformanceResult:
    issues: list[ConformanceIssue] = []
    rules = compile_temporal(spec)
    total = len(rules)
    for rule in rules:
        issues.append(_check(trace, rule))
    failed = [item for item in issues if item.status == "FAIL"]
    unknown = [item for item in issues if item.status == "UNKNOWN"]
    if failed:
        status: str = "FAIL"
    elif unknown:
        status = "UNKNOWN"
    else:
        status = "PASS"
    executed = {event.node_id for event in trace.events if event.status in {"success", "mocked"}}
    required = {item.tool or item.kind for item in spec.required_actions}
    req_hit = sum(
        1
        for sel in required
        if any(sel in {e.node_id, e.node_type, e.operation} for e in trace.events)
    )
    branch_nodes = {event.node_id for event in trace.events if event.node_type == "branch"}
    branched = {event.node_id for event in trace.events if event.branch}
    return ConformanceResult(
        status=status,
        issues=issues,
        node_coverage=len(executed) / max(trace.node_count or len(executed) or 1, 1),
        required_action_coverage=req_hit / max(len(required), 1),
        constraint_runtime_coverage=sum(1 for item in issues if item.status != "UNKNOWN") / max(total, 1),
        branch_coverage=(len(branched) / max(len(branch_nodes), 1)) if branch_nodes else 1.0,
        verifiable=sum(1 for item in issues if item.status != "UNKNOWN"),
        total=total,
        unknown=len(unknown),
    )


def _check(trace: ExecutionTrace, rule: MonitorRule) -> ConformanceIssue:
    a = _hits(trace, rule.a)
    b = _hits(trace, rule.b) if rule.b else []
    if rule.kind == "BEFORE":
        if not b:
            return _ok(rule, "B never ran")
        if a and min(a) < min(b):
            return _ok(rule, f"A@{min(a)} before B@{min(b)}")
        return _fail(
            trace,
            rule,
            "A before B",
            f"B at {min(b)} without earlier A",
            min(b),
            [rule.a, rule.b or ""],
            expected_predecessor=rule.a,
        )
    if rule.kind == "AFTER":
        # a should occur after b  (alias of BEFORE(b, a))
        if not a:
            return _ok(rule, "A never ran")
        if b and min(b) < min(a):
            return _ok(rule, f"B@{min(b)} before A@{min(a)}")
        return _fail(
            trace,
            rule,
            "A after B",
            f"A at {min(a)} without earlier B",
            min(a),
            [rule.a, rule.b or ""],
            expected_predecessor=rule.b,
        )
    if rule.kind == "EVENTUALLY":
        if a:
            return _ok(rule, f"saw {rule.a}")
        last = trace.events[-1].event_index if trace.events else None
        return _fail(trace, rule, f"eventually {rule.a}", "not in trace", last, [rule.a])
    if rule.kind == "NEVER":
        if not a:
            return _ok(rule, "absent")
        return _fail(trace, rule, "never A", f"A at {a[0]}", a[0], [rule.a])
    if rule.kind == "EXACTLY_ONCE":
        if len(a) == 1:
            return _ok(rule, "once")
        return _fail(trace, rule, "exactly once", f"count={len(a)}", a[0] if a else None, [rule.a])
    if rule.kind == "AT_LEAST_ONCE":
        if a:
            return _ok(rule, "seen")
        return _fail(trace, rule, "at least once", "0", None, [rule.a])
    if rule.kind == "AT_MOST_ONCE":
        if len(a) <= 1:
            return _ok(rule, f"count={len(a)}")
        return _fail(trace, rule, "at most once", f"count={len(a)}", a[1], [rule.a])
    if rule.kind == "IF_EXECUTED_THEN":
        if not a:
            return _ok(rule, "A not executed")
        last_b = max(b) if b else None
        unmet = [index for index in a if last_b is None or index >= last_b]
        if not unmet:
            return _ok(rule, "obligation met")
        return _fail(
            trace,
            rule,
            f"if {rule.a} then {rule.b}",
            "B missing after A",
            min(unmet),
            [rule.a, rule.b or ""],
            expected_predecessor=rule.a,
        )
    if rule.kind == "IF_BRANCH_THEN":
        wanted = rule.branch or "true"
        branches = [
            event
            for event in trace.events
            if event.status in {"success", "mocked"}
            and event.branch == wanted
            and (
                event.node_id == rule.a
                or event.operation == rule.a
                or event.node_type == rule.a
            )
        ]
        if not branches:
            return ConformanceIssue(
                constraint_id=rule.constraint_id,
                status="UNKNOWN",
                expected=f"branch {wanted} then {rule.b}",
                observed="branch not observed",
                method="RUNTIME",
            )
        # Each trigger creates an eventual obligation. One later consequence
        # may discharge several pending obligations, but never a later trigger.
        last_b = max(b) if b else None
        unmet = [
            event.event_index
            for event in branches
            if last_b is None or event.event_index >= last_b
        ]
        if not unmet:
            return _ok(rule, "then-event seen")
        return _fail(
            trace,
            rule,
            f"if branch {wanted} then {rule.b}",
            "then-event missing after branch",
            min(unmet),
            [rule.b or ""],
        )
    if rule.kind == "DATA_FROM":
        if not b:
            return _ok(rule, "consumer never ran")
        if a and min(a) < min(b):
            return _ok(rule, f"producer@{min(a)} used by consumer@{min(b)}")
        return _fail(
            trace,
            rule,
            f"data from {rule.a} used by {rule.b}",
            f"consumer at {min(b)} without earlier producer",
            min(b),
            [rule.a, rule.b or ""],
            expected_predecessor=rule.a,
        )
    return ConformanceIssue(
        constraint_id=rule.constraint_id,
        status="UNKNOWN",
        expected=rule.kind,
        observed="unsupported temporal op",
        method="RUNTIME",
    )


def _ok(rule: MonitorRule, observed: str) -> ConformanceIssue:
    return ConformanceIssue(
        constraint_id=rule.constraint_id,
        status="PASS",
        expected=rule.requirement or rule.kind,
        observed=observed,
        method="RUNTIME",
    )


def _fail(
    trace: ExecutionTrace,
    rule: MonitorRule,
    expected: str,
    observed: str,
    index: int | None,
    nodes: list[str],
    expected_predecessor: str | None = None,
) -> ConformanceIssue:
    cex = counterexample(
        trace,
        expected=expected,
        observed=observed,
        index=index,
        expected_predecessor=expected_predecessor,
    )
    return ConformanceIssue(
        constraint_id=rule.constraint_id,
        status="FAIL",
        expected=expected,
        observed=observed,
        violation_index=index,
        affected_nodes=[item for item in nodes if item],
        trace_slice=slice_around(trace, index),
        counterexample=cex,
        method="RUNTIME",
    )
