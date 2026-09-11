"""Partial-order aware runtime trace alignment.

Primary algorithm
-----------------
1. Happens-before = transitive closure of IR edges, tightened by spec BEFORE constraints.
2. Expected nodes = IR nodes that should run (all nodes, or skip-set excluded at runtime).
3. Observed = successful/mocked trace events in order.
4. Kahn linear extension biased by observed index (concurrent nodes follow the trace).
5. Needleman–Wunsch / Levenshtein DP on that extension vs observed ids (O(n m)).
6. If two matched nodes violate happens-before, relabel OUT_OF_ORDER.
   Incomparable nodes that swapped order stay MATCH (not a unique linear order).

Not Petri-net process mining. Display uses one linear extension.

Complexity: O(V^2) reachability + O(n m) DP.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from veriflow_ir.graph import outgoing, sources
from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.models import ExecutionTrace
from veriflow_spec.models import WorkflowSpec

AlignKind = str  # MATCH | MISSING_EXPECTED | UNEXPECTED_EXECUTION | OUT_OF_ORDER | BRANCH_MISMATCH


class AlignRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected: str | None = None
    observed: str | None = None
    kind: AlignKind
    evidence: str = ""


class AlignmentResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alignment: list[AlignRow] = Field(default_factory=list)
    alignment_cost: int = 0
    sequential_edit_distance: int = 0
    deviation_count: int = 0
    minimal_deviation: list[AlignRow] = Field(default_factory=list)
    expected_sequence: list[str] = Field(default_factory=list)
    observed_sequence: list[str] = Field(default_factory=list)
    algorithm_id: str = "runtime.alignment"
    algorithm_version: str = "1.0"
    limitations: str = "Approximate concurrent matching; not a full process-mining aligner."


def _closure(ir: WorkflowIR) -> dict[str, set[str]]:
    adj = outgoing(ir)
    down: dict[str, set[str]] = {node.id: set() for node in ir.nodes}
    for node in ir.nodes:
        stack = list(adj.get(node.id, []))
        seen = set()
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            down[node.id].add(cur)
            stack.extend(adj.get(cur, []))
    return down


def _tighten(ir: WorkflowIR, spec: WorkflowSpec, down: dict[str, set[str]]) -> dict[str, set[str]]:
    from veriflow_ir.graph import match_nodes

    for item in spec.ordering_constraints:
        befores = match_nodes(ir, item.before)
        afters = match_nodes(ir, item.after)
        for before in befores:
            for after in afters:
                down.setdefault(before.id, set()).add(after.id)
                down[before.id] |= down.get(after.id, set())
    return down


def _topo_biased(ir: WorkflowIR, observed_index: dict[str, int]) -> list[str]:
    adj = outgoing(ir)
    indeg = {node.id: 0 for node in ir.nodes}
    for edge in ir.edges:
        indeg[edge.to] = indeg.get(edge.to, 0) + 1
    ready = [nid for nid, deg in indeg.items() if deg == 0] or list(sources(ir))
    order: list[str] = []
    pending = set(indeg)
    while ready:
        ready.sort(key=lambda nid: (observed_index.get(nid, 10**9), nid))
        cur = ready.pop(0)
        if cur not in pending:
            continue
        pending.remove(cur)
        order.append(cur)
        for nxt in adj.get(cur, []):
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                ready.append(nxt)
    for nid in sorted(pending):
        order.append(nid)
    return order


def _edit_align(expected: list[str], observed: list[str]) -> tuple[list[AlignRow], int]:
    n, m = len(expected), len(observed)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dp[i][0] = i
    for j in range(1, m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if expected[i - 1] == observed[j - 1] else 10**6
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    rows: list[AlignRow] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and expected[i - 1] == observed[j - 1] and dp[i][j] == dp[i - 1][j - 1]:
            rows.append(AlignRow(expected=expected[i - 1], observed=observed[j - 1], kind="MATCH"))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            rows.append(AlignRow(expected=expected[i - 1], observed=None, kind="MISSING_EXPECTED"))
            i -= 1
        else:
            rows.append(AlignRow(expected=None, observed=observed[j - 1] if j else None, kind="UNEXPECTED_EXECUTION"))
            j -= 1
    rows.reverse()
    return rows, dp[n][m]


def align_trace(ir: WorkflowIR, spec: WorkflowSpec, trace: ExecutionTrace) -> AlignmentResult:
    observed_events = [event for event in trace.events if event.status in {"success", "mocked"}]
    observed = [event.node_id for event in observed_events]
    obs_index = {}
    for index, nid in enumerate(observed):
        obs_index.setdefault(nid, index)
    down = _tighten(ir, spec, _closure(ir))
    expected = _topo_biased(ir, obs_index)
    rows, seq_cost = _edit_align(expected, observed)
    last_matched: str | None = None
    last_index = -1
    for row in rows:
        if row.kind != "MATCH" or not row.expected:
            continue
        nid = row.expected
        if last_matched and nid in down.get(last_matched, set()):
            pass
        if last_matched and last_matched in down.get(nid, set()):
            if obs_index.get(nid, 0) < obs_index.get(last_matched, 0):
                row.kind = "OUT_OF_ORDER"
                row.evidence = f"{nid} observed before predecessor {last_matched}"
        last_matched = nid
        last_index = obs_index.get(nid, last_index)
    for event in observed_events:
        if event.branch == "false":
            for item in spec.temporal_constraints:
                if item.kind == "IF_BRANCH_THEN" and (item.branch or "true") == "true":
                    rows.append(
                        AlignRow(
                            expected=f"branch:{item.branch or 'true'}",
                            observed=f"branch:{event.branch}",
                            kind="BRANCH_MISMATCH",
                            evidence=event.node_id,
                        )
                    )
                    break
    deviations = [row for row in rows if row.kind != "MATCH"]
    po_extra = sum(1 for row in rows if row.kind == "OUT_OF_ORDER")
    return AlignmentResult(
        alignment=rows,
        alignment_cost=seq_cost + po_extra,
        sequential_edit_distance=seq_cost,
        deviation_count=len(deviations),
        minimal_deviation=deviations,
        expected_sequence=expected,
        observed_sequence=observed,
    )
