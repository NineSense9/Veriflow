# Visual QA — 2026-09-11

Screenshots: `artifacts/visual-qa/` (not production assets).

## Logo root cause (FIXED)

`.brand-mark` is a `<span>`. CSS `.brand span` (subtitle muted color + 11px) had **higher specificity** than `.brand-mark`, so the “V” inherited `--muted` on `--accent`. Light: gray on teal → looks like a green block. Dark: slightly better contrast on brighter teal.

Fix: subtitle selector is `.brand-text > span`. Mark uses `--logo-fg` (`#fff` light / `#042f2e` dark). Shared `Brand` component.

| Theme | Status |
|---|---|
| Light desktop | FIXED — white V on teal, readable |
| Dark desktop | PASS — dark V on mint |

## Route matrix

| Route | Viewport | Light | Dark | Contrast | Overflow | Layout | Brand | Status |
|---|---|---|---|---|---|---|---|---|
| Home `/` | 1440 | PASS | PASS | PASS | PASS | Compact strip + table | FIXED | PASS |
| Report | 1440 | PASS | PASS | PASS | KNOWN: DAG fitView leaves empty canvas around small graphs | 8/4 split + strip | FIXED | PASS |
| Report | 390 | PASS | PASS | PASS | DAG clipped (expected; zoom/scroll) | Inspector stacks below | FIXED | PASS |
| Algorithms | 1440 | PASS | (screenshot taken) | PASS | PASS | Table not cards | FIXED | PASS |
| Benchmark | 1440 | PASS | PASS | PASS | PASS | Compact strip | FIXED | PASS |
| Compose | 1440 | PASS | PASS | PASS | PASS | Form + list | FIXED | PASS |
| Studio `/compose/[id]` | 1440 | PASS | PASS | PASS | DAG empty padding around 2-node graph (fitView) | Split canvas + checklist | FIXED | PASS |

## Known issues

- Small DAGs leave empty area inside the graph pane (React Flow fitView). Not a blank page; graph is there.
- Mobile report: graph below the fold; hamburger nav works; no horizontal page scroll observed.
- `next lint` not configured (Next 15 interactive setup). **SKIP**: typecheck + `next build` used instead.
- Studio checklist still uses `.sample` rows (taller than Report triage table). Functional, not restyled this pass.
- `artifacts/visual-qa/topbar-light.png` is a login-page clip (no brand). Use `home-*-desktop.png` / `studio-*-desktop.png` for logo.

## Contrast / a11y notes

- PASS/FAIL use text + color (`.verdict` labels).
- Logo is not color-only; letter V is present.
- Focus rings use `--focus-ring` token.
