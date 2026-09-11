# Veriflow algorithms (as implemented)

This is not a marketing document. Complexity refers to the Python currently in-tree.

## Problem

Given a natural-language problem-setting requirement `R` and a candidate `WorkflowIR` `G=(V,E)`:

1. Compile `R` to `WorkflowSpec` `S` (heuristic, deterministic).
2. Check `S` for internal conflicts (`SPEC_CONFLICT`).
3. Check `G` against graph rules and `S`.
4. Emit issues with expected/actual/witness.
5. Optionally search a small set of guarded patches and re-verify.

The judged *student programs* still use Docker/process sandbox. Compose-graph runtime conformance uses a **mock DAG walk** (`veriflow_runtime.mock_exec`), not a live n8n worker.

## WorkflowSpec

`packages/spec`. Constraints: required actions (cardinality), ordering, data dependencies, safety policies, optional branch (usually UNKNOWN).

Compiler: keyword/domain templates. No LLM in the default path. `compiler="heuristic"`.

Consistency: pairwise reverse ordering, unknown refs, exactly_one∩optional.

## Verification

`verify_workflow` (`packages/verify/veriflow_verify/result.py`):

- Structural: existing `check_workflow` (whitelist, on_fail, guard AST, types, dead nodes, human gate).
- Semantic: match nodes by id/kind/tool; ordering uses path enumeration `paths_to` (DFS-style stack, cap 16 paths) and BFS `shortest_path`.
- Dataflow: `out_type`/`in_type` mismatch + spec producer→consumer reachability.
- Safety: config key heuristics, URL heuristic, bounds keywords. **Risk detected, not a proof.**
- Branch constraints: **UNKNOWN** (no IF interpreter on compose IR).

Overall status: FAIL if high/critical issues; WARNING if only milder issues; UNKNOWN if no FAIL but unknown constraints remain; else PASS.

Graph search: `O(|V|+|E|)` BFS; `paths_to` is exponential in worst case, bounded by `limit=16`.

## Counterexample

An `Issue` is the counterexample record. Witness for missing gate: a source→publish path that skips `human_gate`. Affected edges are consecutive witness pairs when ordering fails.

Root-cause grouping: same `affected_nodes` bucket. Rule-based, not causal inference.

## Repair

1. `plan_candidates` ≤3 deterministic patch lists from the planner.
2. `validate_preconditions` then `apply_patches` then `validate_postconditions`.
3. Lexicographic pick: target issue fixed; no new HIGH/CRITICAL; fewer failed constraints; executable not worse; fewer node/edge/param edits; fewer ops.
4. Accept only `REPAIR_ACCEPTED`. Otherwise keep original IR (`REPAIR_REJECTED_*`).
5. Loop at most 3 times; duplicate issue fingerprint stops.

This is **minimal guarded repair**, not LLM regenerate.

## Fault injection / bench

Mutations must change serialized IR or raise `InvalidMutation`. Metrics are computed from that run. Localization: node/edge fields vs issue `affected_nodes`/`affected_edges`.

LLM-as-judge baseline: **N/A** unless a Key is configured and a runner exists. Do not invent scores.

## Runtime monitor

Temporal subset (not LTL): BEFORE, AFTER, EVENTUALLY, NEVER, EXACTLY_ONCE, AT_LEAST_ONCE, AT_MOST_ONCE, IF_EXECUTED_THEN, IF_BRANCH_THEN, DATA_FROM.

One pass over `events[]`. Obligations such as IF A THEN B fail if A is seen and B is not before trace end. UNKNOWN if a branch was never observed.

Coverage: executed nodes / IR node count; required actions seen; verifiable constraints / total; branch nodes with a recorded branch.

## Incremental verification

Diff kinds: NODE_ADDED/REMOVED, NODE_TYPE_CHANGED, PARAMETER_CHANGED, EDGE_ADDED/REMOVED, CONDITION_CHANGED, BINDING_CHANGED, TRIGGER_CHANGED.

Impact = changed nodes ∪ downstream. Re-run only affected verifier categories when a previous result exists. Node add/remove → full `verify_workflow`. Equivalence compares status, issue codes, failed constraint ids.

## Reliability gate

`evaluate_gate`: fail on CRITICAL/HIGH (policy), runtime FAIL, coverage below `minimum_coverage`. UNKNOWN + warning policy → REVIEW REQUIRED (exit 0). Exceptions in CLI → exit 2.

## Limitations

- Canonical IR is compose-json. n8n is a **nodes/connections subset** stored in parameters; not a live instance.
- Dify adapter raises NotImplementedError.
- No SMT.
- No full inter-node taint.
- Spec paraphrases for stability are hand-written Chinese variants, not an LLM rewrite engine.
- Sandbox isolation applies to submitted contestant code, not to IR patch application (pure JSON rewrite).
- Runtime CASE 4 uses `skip_after` to truncate a mock trace; it is not a recorded production execution.
