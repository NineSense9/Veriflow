from __future__ import annotations

from veriflow_runtime.models import ExecutionTrace, TraceCounterexample, TraceEvent


def predecessor(trace: ExecutionTrace, index: int | None) -> TraceEvent | None:
    if index is None:
        return None
    prev = [event for event in trace.events if event.event_index < index]
    return prev[-1] if prev else None


def slice_around(trace: ExecutionTrace, index: int | None, window: int = 2) -> list[int]:
    if index is None:
        return [event.event_index for event in trace.events[:3]]
    lo = max(0, index - window)
    hi = index
    return [event.event_index for event in trace.events if lo <= event.event_index <= hi]


def label_event(event: TraceEvent) -> str:
    branch = f".{event.branch}" if event.branch else ""
    effect = f" {event.external_effect}" if event.external_effect else ""
    return f"#{event.event_index} {event.operation}{branch} {event.status}{effect}"


def counterexample(
    trace: ExecutionTrace,
    *,
    expected: str,
    observed: str,
    index: int | None,
    expected_predecessor: str | None = None,
) -> TraceCounterexample:
    actual = predecessor(trace, index)
    ids = slice_around(trace, index)
    by_index = {event.event_index: event for event in trace.events}
    return TraceCounterexample(
        violation_index=index,
        expected=expected,
        observed=observed,
        expected_predecessor=expected_predecessor,
        actual_predecessor=label_event(actual) if actual else None,
        slice_labels=[label_event(by_index[i]) for i in ids if i in by_index],
    )
