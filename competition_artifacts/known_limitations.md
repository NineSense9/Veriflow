# Implementation Audit (productization / runtime round)

Baseline (hardening): `artifacts/baseline/summary.json` — pytest 80 passed.  
This round: run `python -m pytest -q` and `scripts/competition_smoke.py` for current numbers. Do not copy stale pass counts into a claim of completeness.

Status values: IMPLEMENTED | PARTIAL | NOT IMPLEMENTED | BROKEN

| Capability | Implementation | Tests | Status |
|---|---|---|---|
| WorkflowSpec | `packages/spec/veriflow_spec/models.py` | `tests/test_spec.py` | IMPLEMENTED |
| Spec Compiler | heuristic NL→spec `compiler.py` | `test_spec.py` | IMPLEMENTED (heuristic; LLM spec compile PARTIAL) |
| Spec Validation | `validator.py`, `consistency.py` | `test_hardening.py` | IMPLEMENTED |
| Temporal subset | BEFORE/AFTER/EVENTUALLY/NEVER/EXACTLY_ONCE/AT_LEAST_ONCE/AT_MOST_ONCE/IF_EXECUTED_THEN/IF_BRANCH_THEN/DATA_FROM | `test_runtime.py` | IMPLEMENTED (not LTL) |
| WorkflowIR | `packages/ir/veriflow_ir/workflow.py` | `test_workflow_ir.py` | IMPLEMENTED |
| n8n JSON subset | `ir/n8n_subset.py` RoundTripValidator | `test_n8n_roundtrip_validator` | PARTIAL (IR fields survive; live n8n not connected) |
| Runtime Trace | `packages/runtime` mock DAG walk + redaction | `test_runtime.py` | IMPLEMENTED (mock; live n8n OPTIONAL) |
| Temporal Monitor | `runtime/monitor.py` + `compiler.py` | CASE 4 | IMPLEMENTED |
| Trace counterexample | `runtime/evidence.py` slice + predecessor | CASE 4 | IMPLEMENTED |
| Cross verification | `runtime/cross.py` | STATIC PASS + RUNTIME FAIL | IMPLEMENTED |
| Trace coverage | node / required action / constraint / branch | gold coverage 1.0 in unit test | IMPLEMENTED |
| Side-effect guard | PURE/READ_ONLY/CONTROL_FLOW/EXTERNAL_WRITE/DESTRUCTIVE/UNKNOWN | publish is MOCKED | IMPLEMENTED |
| Incremental verify | impact + scoped re-run; topology → full fallback | `test_incremental_matches_full_*` | PARTIAL (param/condition scoped; node add/remove full) |
| Full vs incremental equivalence | `equivalence_report` disagreements, not hardcoded 100% | tests assert equivalent | IMPLEMENTED as experiment |
| CI Gate | `verify/gate.py` exit 0/1, tool error 2 | `test_gate_*` | IMPLEMENTED |
| Gate policy | `examples/veriflow-policy.yaml` | `test_policy_yaml_loads` | IMPLEMENTED |
| JUnit | `render_junit` | `test_gate_ready_on_gold` | IMPLEMENTED |
| GitHub Action | `.github/workflows/veriflow.yml` | CI | IMPLEMENTED (no API keys) |
| Structural Verifier | `staticcheck/check.py` | `test_staticcheck.py` | IMPLEMENTED |
| Semantic Constraint | `verify/semantic.py` | `test_verify_repair.py` | IMPLEMENTED |
| Dataflow | TYPE_MISMATCH + spec deps | golden case2 | PARTIAL (no taint graph) |
| Executable (compose) | DEAD_NODE reachability | `test_staticcheck.py` | PARTIAL |
| Safety | policy heuristics | golden case3 | PARTIAL (not taint) |
| Counterexample | Issue expected/actual/path | missing_gate | IMPLEMENTED |
| Guarded Repair | Patch DSL + guard + lex | repair tests | IMPLEMENTED |
| Repair + incremental screen | `select.py` then full before accept | loop fields | IMPLEMENTED |
| Fault Injection | IR mutants | `test_mutation_must_change_graph` | IMPLEMENTED |
| Benchmark | `verify/bench.py` | `experiments/runs/smoke` | IMPLEMENTED (in-repo gold only) |
| Live n8n instance | `n8n_live.py` env + fetch | unavailable without env | NOT IMPLEMENTED (no fake) |
| Dify adapter | raises NotImplementedError | — | NOT IMPLEMENTED |
| Verification cache | — | — | NOT IMPLEMENTED |
| Reliability history / corpus | — | — | NOT IMPLEMENTED |
| Ablation / LLM-judge baseline | — | — | NOT IMPLEMENTED (N/A) |
| SMT/Z3 | — | — | NOT IMPLEMENTED |
| Frontend Studio | Runtime / Changes / Gate on existing compose page | tsc | IMPLEMENTED (no restyle) |
| CLI | spec/verify/repair/runtime/gate/incremental/bench | smoke | IMPLEMENTED |

## Honest gaps

- Incremental verification **does not skip work** on node add/remove; it records impact and full-verifies. Parameter-only edits re-run safety and merge.
- n8n support is **JSON shape round-trip**, not a control plane.
- Runtime traces are **mock DAG walks**. Truncation (`skip_after`) is how CASE 4 injects a runtime miss.
- No production customers. Metrics are in-repo.
