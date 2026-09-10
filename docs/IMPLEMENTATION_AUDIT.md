# Implementation Audit (hardening round)

Baseline: `artifacts/baseline/summary.json` — pytest 80 passed, tsc pass.  
After this round: pytest **90 passed**, tsc pass.

Status values: IMPLEMENTED | PARTIAL | NOT IMPLEMENTED | BROKEN

| Capability | Claimed | Implementation | Tests | E2E | Frontend | Status |
|---|---|---|---|---|---|---|
| WorkflowSpec | yes | `packages/spec/veriflow_spec/models.py` | `tests/test_spec.py` | CLI `veriflow spec` | Studio checklist | IMPLEMENTED |
| Spec Compiler | heuristic NL→spec | `compiler.py` | `test_spec.py`, `test_hardening.py` | yes | NL textarea | IMPLEMENTED (heuristic; LLM spec compile PARTIAL) |
| Spec Validation | yes | `validator.py`, `consistency.py` | `test_hardening.py::test_spec_conflict_ordering` | via verify | spec_issues in API | IMPLEMENTED |
| WorkflowIR | yes | `packages/ir/veriflow_ir/workflow.py` | `test_workflow_ir.py` | yes | React Flow | IMPLEMENTED |
| n8n Adapter | architecture only | `adapter.py` raises NotImplementedError | `test_verify_repair.py` | no | no | NOT IMPLEMENTED (honest stub) |
| Structural Verifier | yes | `staticcheck/check.py` | `test_staticcheck.py` | yes | issues | IMPLEMENTED |
| Semantic Constraint | yes | `verify/semantic.py` | `test_verify_repair.py` | yes | checklist | IMPLEMENTED |
| Dataflow Verifier | type + spec deps | `check.py` TYPE_MISMATCH + `semantic._data_deps` | golden case2 | yes | yes | PARTIAL (no full taint graph) |
| Executable Verifier | reachability | DEAD_NODE | `test_staticcheck.py` | sandbox for *code* not compose graph | no compose runtime | PARTIAL |
| Safety Verifier | policy heuristics | `verify/safety.py` | golden case3 | yes | yes | PARTIAL (not full taint) |
| Counterexample | Issue expected/actual/path | `issue.py`, `explain/` | `test_verify_repair.py` | CLI --explain | highlight | IMPLEMENTED |
| Witness Path | graph BFS | `ir/graph.py` | missing_gate witness | yes | DAG | IMPLEMENTED |
| Root Cause | rule grouping | `explain/rootcause.py` | `test_hardening.py` | API root_causes | listed | PARTIAL (rule-based, not causal inference) |
| Patch DSL | yes | `repair/patch.py` | repair tests | verify-repair | patch list | IMPLEMENTED |
| Patch Guard | pre/post | `repair/guard.py` | `test_patch_precondition_rejects_missing_edge` | yes | reason codes | IMPLEMENTED |
| Repair Planner | deterministic K≤3 | `planner.py`, `select.py` | repair loop tests | yes | candidates_evaluated | IMPLEMENTED |
| Repair Loop | max 3, lex accept | `loop.py` | `test_guarded_repair_fixes_missing_gate` | CLI | Timeline | IMPLEMENTED |
| Rollback | reject keeps IR | `loop.py` | `test_repair_loop_caps_iterations` | yes | reason | IMPLEMENTED |
| Fault Injection | IR mutants | `mutate/ir_faults.py` | `test_mutation_must_change_graph` | `veriflow mutate` | no | IMPLEMENTED |
| Ground Truth | expected_detection + targets | `MutatedWorkflow` | bench | smoke | no | IMPLEMENTED |
| Benchmark Metrics | computed | `verify/bench.py` | `test_bench.py` | `experiments/runs/smoke` | `/api/bench/latest` | IMPLEMENTED (in-repo gold only) |
| Ablation | planned | not a full matrix runner | no | no | no | NOT IMPLEMENTED |
| Spec Stability | paraphrase jaccard | `spec/stability.py` | `test_spec_stability_heuristic` | no dashboard | no | PARTIAL (heuristic paraphrases) |
| Metamorphic | rename/shuffle | `verify/metamorphic.py` | `test_metamorphic_rename_stable` | no | no | IMPLEMENTED |
| Evidence Bundle | JSON bundle | `verify/bundle.py` | `test_evidence_bundle_is_not_a_proof` | no UI export yet | no | PARTIAL |
| Frontend Studio | yes | `apps/web/app/compose/[id]/page.tsx` | tsc | manual | yes | IMPLEMENTED |
| Report Export | judge report + bench md | `api/report.py`, bench `report.md` | existing | yes | download md | PARTIAL |
| CLI | `veriflow_*` commands | `packages/cli` | smoke script | yes | n/a | IMPLEMENTED |
| API | verify/repair/mutate | `veriflow_api/main.py` | `test_compose_api.py` | yes | studio | IMPLEMENTED |
| Tests | expanding | `tests/` | **90 passed** | — | tsc pass | IMPLEMENTED |
| LLM Judge baseline | fair baseline | not run (no Key, not faked) | — | — | — | NOT IMPLEMENTED (N/A) |
