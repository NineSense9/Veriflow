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
- Semantic: match nodes by id/kind/tool; ordering uses checkpoint-avoidance `bypass_path` and breadth-first `shortest_path`; selectors may match multiple nodes.
- Dataflow: `out_type`/`in_type` mismatch + spec producer→consumer reachability.
- Safety: config key heuristics, URL heuristic, bounds keywords. **Risk detected, not a proof.**
- Branch constraints: **UNKNOWN** (no IF interpreter on compose IR).

Overall status: FAIL if high/critical issues; WARNING if only milder issues; UNKNOWN if no FAIL but unknown constraints remain; else PASS.

Graph search: `bypass_path` uses parent pointers and costs O(V+E). `shortest_path` copies a path for each enqueued node, adding worst-case O(V²). The helper `paths_to` stops after 16 found paths, but can explore exponentially many branches before finding them; it is not the mandatory-checkpoint check. With P publication nodes, graph integrity adds P checkpoint searches. Semantic and dependency costs also depend on selector match combinations.

## Counterexample

An `Issue` is the counterexample record. Witness for missing gate: a source→publish path that skips `human_gate`. Affected edges are consecutive witness pairs when ordering fails.

Root-cause grouping: same `affected_nodes` bucket. Rule-based, not causal inference.

## Repair

1. `plan_candidates` keeps at most 3 candidates: rule patches and optional model proposals. Model output must pass the same guards and verification.
2. `validate_preconditions` then `apply_patches` then `validate_postconditions`.
3. Lexicographic pick: target issue fixed; no new HIGH/CRITICAL; fewer failed constraints; executable not worse; fewer node/edge/param edits; fewer ops.
4. Accept only `REPAIR_ACCEPTED`. Otherwise keep original IR (`REPAIR_REJECTED_*`).
5. Loop at most 3 times; duplicate issue fingerprint stops.

A candidate can be accepted after improving its target while other issues remain. Competition repair success separately requires final static PASS; it does not establish runtime or problem-package completion.

## Fault injection / bench

Mutations must change serialized IR or raise `InvalidMutation`. Metrics are computed from that run. Localization: node/edge fields vs issue `affected_nodes`/`affected_edges`.

The competition runner exists. Saved competition-v2 LLM baseline is **NOT RUN**, with zero repeats and empty scores. Full benchmark: 5 clean + 50 faulty, F1 1.000, localization 35/50, final static repair PASS 38/45. Incremental speedup is NOT MEASURED in that suite.

## Runtime alignment

`runtime.alignment` (`packages/runtime/veriflow_runtime/align.py`): happens-before closure + spec BEFORE, Kahn extension biased by observed order, Needleman–Wunsch DP, then relabel HB reversals as `OUT_OF_ORDER`. Incomparable nodes are not forced into a unique linear order. Cost = sequential edit distance + order violations. Closure searches from each node, O(V(V+E)); repeatedly sorting ready nodes adds worst-case O(V² log V); edit-distance DP is O(nm), with additional selector matching and branch checks. Not Petri-net process mining.

## Minimized counterexample

Witness path + affected endpoints. Approximate. `globally_minimal=false`.

## Registries

`NodeSemanticsRegistry` (`veriflow_ir.semantics`) is queried by staticcheck whitelist and side-effect classification. `AlgorithmRegistry` (`veriflow_verify.algorithms`) is the same catalog the Algorithm Center API returns.

## Runtime monitor

Temporal subset (not LTL): BEFORE, AFTER, EVENTUALLY, NEVER, EXACTLY_ONCE, AT_LEAST_ONCE, AT_MOST_ONCE, IF_EXECUTED_THEN, IF_BRANCH_THEN, DATA_FROM.

One pass over `events[]`. Obligations such as IF A THEN B fail if A is seen and B is not before trace end. UNKNOWN if a branch was never observed.

Coverage: executed nodes / IR node count; required actions seen; verifiable constraints / total; branch nodes with a recorded branch.

## Incremental verification

Diff kinds: NODE_ADDED/REMOVED, NODE_TYPE_CHANGED, PARAMETER_CHANGED, EDGE_ADDED/REMOVED, CONDITION_CHANGED, BINDING_CHANGED, TRIGGER_CHANGED.

Impact = changed nodes ∪ downstream. Re-run affected verifier categories over the whole graph/spec when a previous result exists. The impact node/constraint lists describe changes; they do not directly scope computation. Diff and output lists include sorting. Node add/remove → full `verify_workflow`. Equivalence compares status, issue codes, failed constraint ids.

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
