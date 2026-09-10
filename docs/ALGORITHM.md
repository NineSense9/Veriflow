# Veriflow algorithms (as implemented)

This is not a marketing document. Complexity refers to the Python currently in-tree.

## Problem

Given a natural-language problem-setting requirement `R` and a candidate `WorkflowIR` `G=(V,E)`:

1. Compile `R` to `WorkflowSpec` `S` (heuristic, deterministic).
2. Check `S` for internal conflicts (`SPEC_CONFLICT`).
3. Check `G` against graph rules and `S`.
4. Emit issues with expected/actual/witness.
5. Optionally search a small set of guarded patches and re-verify.

The judged *student programs* still use Docker/process sandbox. Compose-graph “executable” here is reachability, not n8n runtime.

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

## Limitations

- Compose-json only. n8n/Dify adapters are stubs.
- No SMT.
- No full inter-node taint.
- Spec paraphrases for stability are hand-written Chinese variants, not an LLM rewrite engine.
- Sandbox isolation applies to submitted contestant code, not to IR patch application (pure JSON rewrite).
