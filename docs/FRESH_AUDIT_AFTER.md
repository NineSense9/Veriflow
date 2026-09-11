# Fresh Audit AFTER — 2026-09-11

## What was wrong

- Home was an OJ splash; judges could not see Verify → Why → Gate in 30 seconds.
- No Evidence Graph model. Verdicts were scattered fields.
- Spec constraints had no source span on the NL.
- CASE 4 (the default report demo) had **zero static issues**, so Findings said “无 Issue” while runtime FAIL lived only in the matrix.
- Spec/safety `confidence` 0.86 / 0.9 / 0.7 had no formula.
- Algorithm Center metadata existed; there was no `validate_input/execute` adapter.
- No requirement ambiguity check; no evidence export from the UI.
- Bench reported only aggregate F1.

## What was changed

- `docs/FRESH_AUDIT.md` — from-scratch audit of this tree.
- Evidence Graph: `packages/verify/veriflow_verify/egraph.py` built on every `run_session`.
- Source traces: `WorkflowSpec.source_traces` + compiler keyword spans.
- Ambiguity: deterministic `analyze_requirement` (CLEAR/AMBIGUOUS/CONTRADICTORY/UNSUPPORTED/UNKNOWN).
- Runtime FAIL rows in Report **Triage**; Why neighborhood; Requirement highlight; `?demo=`; Evidence export MD+JSON.
- Unexplained confidence removed from spec compiler and safety issues.
- Thin SDK adapters for `graph.integrity|reachability`, `semantic.constraint`, `safety.policy`.
- Mutation `difficulty` EASY/MEDIUM/HARD labels + bench recall + `false_negatives.json`.
- Home CTA: Runtime FAIL example first.

Not rebuilt: staticcheck, repair loop, temporal monitor, alignment DP, gate CI.

## What remains

- SDK does not wrap every registered algorithm (runtime/repair still called directly).
- HARD mutations are **labels on existing faults**, not new stealth mutants. Recall 1.0 on this set does **not** prove hard-error robustness.
- Evidence Graph UI is a 1–2 hop list, not a second canvas.
- `verification_runs` still stores summaries; full session is not restored by run_id (re-run demo instead).
- Live n8n still OPTIONAL INTEGRATION.
- `POST /api/compose/{id}/repair` still whole-IR recompile; Studio uses guarded patches.
- No `next build` / eslint in this pass. No frontend unit test runner.
- Policy library, presentation mode, VeriFuzz dashboard: not added.

## Test numbers (this machine, this commit tree)

```
pytest: 124 passed (1 httpx deprecation warning)
tsc --noEmit: pass
E2E (Edge): home CTA true; /report?demo=case4_runtime Triage + runtime rows + export; case1 MISSING_HUMAN_GATE
```

## Benchmark (in-repo gold IR, n=9, not a leaderboard)

| metric | value |
|---|---|
| detection F1 | 1.0 |
| localization | 0.889 |
| repair success | **0.556** |
| witness reduction | 0.714 |
| easy / medium / hard recall | 1.0 / 1.0 / 1.0 |
| false_negatives | `[]` |
| LLM-judge | N/A |

Hard recall 1.0 is on **labeled** existing mutants. Do not read it as “stealth faults are solved”.

## Known limitations

- Runtime CASE 4 uses mock `skip_after`, not a production n8n log.
- Ambiguity analyzer is keyword rules, not LLM (explicitly Deterministic).
- Compose spec still injects platform policies even when NL is thin; spans mark `platform_policy` when no needle hits.

## Innovation (only what this tree can defend)

1. Specification-guided multi-dimensional verification  
2. Evidence / provenance graph (backend, 1–2 hop Why)  
3. Minimized counterexample + witness  
4. Guarded repair  
5. Runtime alignment + CI gate  

Do not claim Z3, live n8n, or calibrated 94 scores.
