# Competition benchmark

Deterministic enumeration. No sampling randomness.
`SEED=20260919` is provenance only; it does not drive an RNG.

Re-run:

```
python scripts/competition_benchmark.py
python scripts/competition_benchmark.py --llm-repeats 3
```

- dataset: `competition-v2`
- base_workflows: 5 (linear_compose, merge_dual, dataflow_typed, safety_env, branch_notify)
- topology_families: 5 (branch, dataflow, linear, merge, safety)
- clean: 5
- faulty: 50
- runtime_fault_count: 5
- total: 55
- detection F1: 1.000
- diagnosis accuracy: 1.000
- LLM-as-judge: NOT RUN (DEEPSEEK_API_KEY unset)

Ablations (same cases, same order):

- `structure-only`: Only structural static checks. No semantic/dataflow/safety/executable extras. No runtime monitor.  F1=0.462  recall=0.300
- `no-safety`: Full static pipeline minus the safety dimension. Runtime monitor still runs.  F1=0.889  recall=0.800
- `no-runtime`: Full static pipeline. Runtime monitor disabled.  F1=0.947  recall=0.900
- `full`: Full static pipeline plus runtime monitor.  F1=1.000  recall=1.000

Detection = verifier found *an* anomaly on a mutated workflow.
Diagnosis = issue code (or runtime expected text) matches the injected fault.
Runtime-only faults are excluded from the static repair success denominator.
incremental speedup: NOT MEASURED.
This is a repository-internal synthetic mutation suite. Not a public leaderboard. Not SOTA.
