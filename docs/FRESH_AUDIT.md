# Fresh Audit — Veriflow (from the tree on 2026-09-11)

This document is based on reading the current repository and exercising local pages. It is not based on prior upgrade prompts.

Product as shipped: **ACM training station** (problems VF1001–VF1030, Docker/process judge) **plus** a **compose-workflow verification stack** (Spec → IR → static/runtime/repair/gate). Those two surfaces share one Next.js shell and one FastAPI.

---

## 1. What actually exists (code, not README)

| Area | Path | Real status |
|---|---|---|
| WorkflowIR | `packages/ir/veriflow_ir/workflow.py` | IMPLEMENTED. Kinds: tool/guard/human_gate/transform/branch/notify. |
| n8n | `n8n_subset.py`, `n8n_live.py` | PARTIAL JSON round-trip. Live instance OPTIONAL, no env → mock. Dify: NotImplementedError. |
| Spec compiler | `packages/spec/veriflow_spec/compiler.py` | Heuristic templates. No source span. `confidence` is 0.9/0.7/0.85 with no formula. |
| Static check | `packages/staticcheck` | IMPLEMENTED (7 rules). |
| Semantic / safety | `packages/verify/.../semantic.py`, `safety.py` | IMPLEMENTED. Safety `confidence=0.86` / `0.7` unexplained. |
| Runtime mock + temporal monitor + alignment | `packages/runtime` | IMPLEMENTED. Traces are mock DAG walks; CASE 4 uses `skip_after`. |
| Repair | `packages/repair` | IMPLEMENTED. Guard + lex select + incremental screen + full commit. |
| Gate / CI | `gate.py`, `.github/workflows/veriflow.yml` | IMPLEMENTED. Exit 0/1/2. |
| Algorithm registry | `algorithms.py` | Metadata dict used by API + provenance stamps. **Not** an execute() SDK. Verifiers still called directly. |
| Report console | `/report`, `VerificationConsole.tsx` | IMPLEMENTED. Matrix, pipeline, alignment, golden demos from backend. |
| Algorithm Center | `/algorithms` | IMPLEMENTED from registry API. |
| Training site | `/`, `/problems`, `/status`, `/stress` | IMPLEMENTED. |
| Evidence Graph | — | **NOT IMPLEMENTED** as a model. Issues have `detected_by`, `witness_path`, `constraint_id` only. |
| Requirement span | — | **NOT IMPLEMENTED**. |
| Ambiguity analysis | — | **NOT IMPLEMENTED**. |
| Why? chain UI | — | **PARTIAL** (inspector fields, no graph walk). |
| Frontend tests | `apps/web/scripts/smoke-*.mjs` | Playwright smokes exist; **no** `npm test` / lint script. `package.json` has only dev/build/start. |
| Persistence | SQLite `verification_runs` | Summary only (status, codes, hash). Full session **not** reloadable by run_id. |
| Benchmark | `experiments/runs/smoke/metrics.json` | Real in-repo mutants n=9. No Easy/Medium/Hard split. No false-negative corpus. |

---

## 2. Defects that change the product (P0)

### Identity (30-second story)

Home (`app/page.tsx`) is an OJ hero: “把样例骗术拆掉” → VF1001.  
Verification lives under 出题 / 报告 / 算法. A judge landing on `/` does **not** see Import → Requirement → Verify → Evidence → Repair → Gate.

### Evidence is scattered, not a graph

You cannot answer “how was this verdict produced?” as a single walk:

Requirement ↛ Constraint (no span)  
Constraint ↛ Node (selector match only at check time)  
Issue → algorithm id (stamped)  
Runtime FAIL on CASE 4 does **not** appear in Findings (static issues = 0). Matrix/alignment hold the failure. Inspector is empty on the default demo.

### Unexplained numbers

- Spec `confidence`: 0.9 if NL else 0.7; campus 0.85.
- HARDCODED_SECRET `confidence=0.86`; webhook `0.7`.
- These are not calibrated. They must not be shown as reliability scores.

### Algorithm registry vs runtime

Registry is honest metadata and `code_location` files exist. Execution path does not go through `validate_input/execute/produce_evidence`. Algorithm Center is not fake JSON, but it is not an SDK either.

### Report UX

- Default CASE 4: Findings “无 Issue”, DAG may look idle until runtime alignment is scrolled.
- No `?demo=` / `?run=` so refresh re-runs, selection is lost.
- No Evidence Graph neighborhood.
- No export of an evidence pack from the UI.
- Triage is a stack of `.sample` buttons, not a filterable table.

### Spec quality

Compiler always emits the same compose policy (gate, bounds, secrets) even for “天气不好时提醒我”. No CLEAR/AMBIGUOUS/UNSUPPORTED.

### Dual repair APIs

`POST /api/compose/{id}/repair` still **recompiles whole IR** (LLM/fallback).  
`POST /api/verify-repair` and Studio “受约束修复” use Patch DSL. Two different “repair” words.

---

## 3. What is already strong (do not rebuild)

- Deterministic staticcheck + semantic + safety.
- Witness paths for missing gate.
- Guarded repair with rollback; repair success **0.56** on in-repo mutants (honest).
- Mock runtime + temporal subset + PO-aware alignment.
- `veriflow gate` + GitHub Action on commit A/B.
- Golden fixtures `examples/golden/case1–4`.
- Side-effect guard (writes mocked).
- Canonical workflow hash (ignores UI metadata).

---

## 4. Judge questions (honest answers)

| Question | Answer from this repo |
|---|---|
| Who is the user? | Two: (1) ACM trainees using the OJ; (2) people who generate **compose problem-setting graphs** from NL and need a gate before publish. Not “all industries”. |
| Pain | LLM graphs skip human_gate, break order, look statically fine but skip runtime actions. |
| Why not n8n eval? | Canonical IR is compose-json. n8n is a subset mapper. No live n8n in default demo. |
| Why not LLM-as-judge? | Pass/fail is graph/policy/monitor. LLM is optional IR compiler and tutor. Bench LLM baseline is **N/A**. |
| Why not only humans? | Missing-gate detect is milliseconds + witness `gen → pub`. |
| Why Veriflow? | Spec-guided check + evidence + guarded patch + runtime alignment + CI exit codes. |
| AI necessary role | NL → IR (DeepSeek or **keyword fallback**). Not the verdict. |
| Deterministic | staticcheck, semantic, safety heuristics, temporal monitor, alignment DP, patch guard, lex select. |
| Trust | Reproducible codes + witness + tests. Not a 94 score. |
| Quantify | smoke n=9: detection F1 1.0, loc 0.889, repair 0.556, witness reduction 0.714. In-repo only. |

---

## 5. This round will change

P0 (from this audit, not from a feature wishlist):

1. Evidence Graph as a **backend model** built from each session.
2. Constraint **source spans** + click-to-highlight NL.
3. Deterministic **requirement ambiguity** (CLEAR/AMBIGUOUS/…).
4. Findings include **runtime failures**; compact triage; **Why?** chain.
5. Strip unexplained confidence; keep PASS/FAIL/UNKNOWN.
6. Thin Algorithm **SDK adapters** around existing functions (no rewrite).
7. Evidence export (Markdown + JSON).
8. Home + report: 30-second verify path; `?demo=` routing.

P1 (only if P0 fits): mutation difficulty split; FN file on miss.

Will **not** do: extra verifiers, Z3, live n8n, VeriFuzz dashboard, new platforms.

---

## 6. Test / CI snapshot before edits

To be filled after the first pytest run in this pass (see AFTER doc for post-change numbers).
