# Competition benchmark

Re-run (deleting this directory first is expected):

```
python scripts/competition_benchmark.py
```

- seed: `20260919`
- dataset: `competition-v1`
- base_workflows: 3 (valid_lis, commit_a, case4_runtime)
- clean: 3
- faulty: 28
- total: 31
- categories: branch, dataflow, ordering, parameter, runtime, safety, semantic, structural
- full F1: 1.000
- LLM-as-judge: NOT RUN (DEEPSEEK_API_KEY unset)

Ablations use the same cases and seed. structure-only / no-safety / no-runtime / full.
Numbers are measured. This is not a published leaderboard.
