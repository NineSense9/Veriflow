"""Hand-authored runtime regressions independent of the benchmark corpus."""

import pytest

from veriflow_ir.workflow import Edge, Node, WorkflowIR
from veriflow_runtime.mock_exec import mock_execute
from veriflow_runtime.models import ExecutionTrace, TraceEvent
from veriflow_runtime.monitor import monitor_trace
from veriflow_spec.models import TemporalConstraint, WorkflowSpec


def _event(index, node, *, branch=None, status="success"):
    return TraceEvent(
        event_index=index, node_id=node, node_type="branch" if branch else "transform",
        operation=node, branch=branch, status=status,
    )


def _check(kind, events, *, a="a", b=None, branch=None):
    trace = ExecutionTrace(trace_id="regression", workflow_id="manual", events=events)
    spec = WorkflowSpec(
        domain="compose", goal="runtime boundary",
        temporal_constraints=[TemporalConstraint(id="rule", kind=kind, a=a, b=b, branch=branch)],
    )
    return monitor_trace(trace, spec).issues[0]


@pytest.mark.parametrize("kind", ["EXACTLY_ONCE", "AT_MOST_ONCE"])
@pytest.mark.parametrize("status", ["success", "mocked"])
def test_repeated_completed_execution_of_same_node_is_counted(kind, status):
    issue = _check(kind, [_event(0, "a", status=status), _event(1, "a", status=status)])
    assert issue.status == "FAIL"
    assert issue.observed == "count=2"


@pytest.mark.parametrize("status", ["blocked", "error", "skipped"])
def test_noncompleted_event_is_not_an_extra_execution(status):
    assert _check("EXACTLY_ONCE", [_event(0, "a"), _event(1, "a", status=status)]).status == "PASS"


def test_branch_consequence_before_trigger_does_not_satisfy_obligation():
    issue = _check("IF_BRANCH_THEN", [_event(0, "b"), _event(1, "a", branch="true")], b="b")
    assert issue.status == "FAIL"
    assert issue.violation_index == 1


@pytest.mark.parametrize("kind", ["IF_BRANCH_THEN", "IF_EXECUTED_THEN"])
def test_every_trigger_needs_a_later_consequence(kind):
    issue = _check(kind, [_event(0, "a", branch="true"), _event(1, "b"), _event(2, "a", branch="true")], b="b")
    assert issue.status == "FAIL"
    assert issue.violation_index == 2


@pytest.mark.parametrize("kind", ["IF_BRANCH_THEN", "IF_EXECUTED_THEN"])
def test_later_consequence_can_discharge_multiple_pending_triggers(kind):
    issue = _check(kind, [_event(0, "a", branch="true"), _event(1, "a", branch="true"), _event(2, "b")], b="b")
    assert issue.status == "PASS"


def test_branch_trigger_does_not_satisfy_its_own_then_event():
    assert _check("IF_BRANCH_THEN", [_event(0, "a", branch="true")], b="a").status == "FAIL"


@pytest.mark.parametrize("status", ["blocked", "error", "skipped"])
def test_unsuccessful_branch_is_not_a_trigger(status):
    assert _check("IF_BRANCH_THEN", [_event(0, "a", branch="true", status=status)], b="b").status == "UNKNOWN"


def _workflow(nodes, edges, *, branches=()):
    return WorkflowIR(
        ir_version="1.0", domain="compose", name="manual scheduler regression",
        nodes=[Node(id=node, kind="branch" if node in branches else "transform") for node in nodes],
        edges=[Edge(from_=edge[0], to=edge[1], branch=edge[2] if len(edge) > 2 else None) for edge in edges],
    )


def test_merge_waits_for_both_unequal_length_fork_arms():
    trace = mock_execute(_workflow("rabcm", [("r", "a"), ("a", "m"), ("r", "b"), ("b", "c"), ("c", "m")]))
    assert trace.status == "completed"
    assert [event.node_id for event in trace.events] == ["r", "a", "b", "c", "m"]


@pytest.mark.parametrize("take_true", [True, False])
def test_merge_does_not_wait_for_untaken_branch(take_true):
    ir = _workflow("rabcm", [("r", "a", "true"), ("r", "b", "false"), ("a", "m"), ("b", "c"), ("c", "m")], branches="r")
    trace = mock_execute(ir, take_true_branch=take_true)
    assert trace.status == "completed"
    assert [event.node_id for event in trace.events] == (["r", "a", "m"] if take_true else ["r", "b", "c", "m"])


def test_selected_branch_fork_waits_for_all_active_arms():
    ir = _workflow("rabcmd", [("r", "a", "true"), ("r", "b", "true"), ("r", "d", "false"), ("a", "m"), ("b", "c"), ("c", "m"), ("d", "m")], branches="r")
    trace = mock_execute(ir)
    assert trace.status == "completed"
    assert [event.node_id for event in trace.events] == ["r", "a", "b", "c", "m"]


@pytest.mark.parametrize("nodes,edges", [
    ("ab", [("a", "b"), ("b", "a")]),
    ("rab", [("r", "a"), ("a", "b"), ("b", "a")]),
    ("rab", [("a", "b"), ("b", "a")]),
    ("a", [("a", "a")]),
])
def test_cycles_never_report_completed(nodes, edges):
    trace = mock_execute(_workflow(nodes, edges))
    assert trace.status == "failed"
    assert not any(event.node_id in {"a", "b"} for event in trace.events)


def test_cycle_on_untaken_branch_does_not_block_selected_execution():
    ir = _workflow("rabm", [("r", "m", "true"), ("r", "a", "false"), ("a", "b"), ("b", "a")], branches="r")
    trace = mock_execute(ir)
    assert trace.status == "completed"
    assert [event.node_id for event in trace.events] == ["r", "m"]
