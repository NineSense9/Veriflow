# Application value (internal evaluation)

Audience: people who generate or edit **compose / problem-setting workflows** (and the same IR for the campus appendix). Not a claim of finance, healthcare, education, or government deployments.

Who it is for:

- AI workflow developers generating graphs from natural language
- Low-code / agent workflow builders who need a spec, not a score
- CI / QA engineers who need a reliability gate before publish

## Without Veriflow

Generate a workflow JSON, inspect it by eye, run an ad-hoc test, debug, fix, rerun. Failures show up as “the graph looks fine but the action never happened” with no witness.

## With Veriflow (internal evaluation on this repo)

| Question | What we actually measured |
|---|---|
| Can it go live? | `veriflow gate` READY vs BLOCKED (`examples/ci/commit_a.json` vs `commit_b.json`) |
| Did a connection change regress? | commit B removes `review → pub`; gate exit **1** (quality fail, not crash) |
| Does runtime match the spec? | CASE 4: static PASS, mock skip after `if_pay`, runtime FAIL, trace slice on IF.true |
| After repair, did we break something else? | Guarded loop + incremental screen + full verify before accept; `test_guarded_repair_fixes_missing_gate` |
| Time to detect missing gate | `verify_workflow` on `missing_gate.json` in pytest (milliseconds on the development machine) |
| Time to locate | witness `gen → pub` |
| Repair operations | 2 guarded iterations to PASS on missing_gate (see repair tests / smoke bench) |

No enterprise customers. No production n8n fleet. No partner logos.

## CI loop (CASE 5)

1. Commit A: `examples/ci/commit_a.json` → gate exit 0.
2. Commit B: drop the review edge → `ORDER` / `MISSING_HUMAN_GATE` → exit 1.
3. Commit C: restore the edge → exit 0.

GitHub Action: `.github/workflows/veriflow.yml`. Secrets are not hardcoded. Without an LLM key, deterministic verifiers still run.

## What we do not claim

- Formal verification / SMT completeness
- Live n8n side effects (EXTERNAL_WRITE is mocked)
- Detection F1 on an external leaderboard (in-repo mutants only)
- “93/100 overall reliability score”
