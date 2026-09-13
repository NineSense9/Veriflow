# Readability Audit

## Resolved

- Initial React Flow viewport sometimes stayed at identity, clipping the workflow.
  The viewport now derives directly from fixed node bounds and container size.
  Selection does not change geometry. Desktop graphs use the full workspace width.
- ChromaGrid darkened content with two brightness filters and a dark gradient.
  Cards now have solid theme surfaces, readable text, decorative light behind content,
  and native links to algorithm details. Contrast is tested in both themes.
- Architecture overview displayed every crossing edge at once. Existing repository
  modules now have five labeled sections; selecting a module reveals its recorded
  direct incoming/outgoing relations, source references, and responsibilities.
- Mobile navigation omitted evaluation and laboratory destinations; all are included.
  Escape closes the menu, and its panel scrolls within the viewport.
- Algorithm load errors no longer continue to display a loading state. Retry is exposed.
- Replay cursor selection no longer resets merely because a parent creates an
  equivalent event-index array; selected events take precedence over initial cursor.

## Validation

- 20 Playwright cases: 4 golden workflows, desktop/tablet/mobile, both themes,
  graph containment, no overlap, selection stability, algorithm contrast >= 4.5:1,
  architecture module details, and mobile navigation.
- 12 existing/local graph, evidence-selection, and Stepper unit checks passed.
- TypeScript and Next.js production build passed.
- Python: 177 passed; one existing Starlette deprecation warning.
- Local production browser audit: authenticated data, 14 algorithm cards, 6 workflow
  nodes, algorithm detail links, architecture details, and adjacent routes. No page errors.
- Screenshots are in `output/readability/` and `output/graph-layout/`.

## Deployment

See `deploy/WEB_RELEASES.md`. Builds are isolated from the active directory and run
under a resource-limited transient unit. A READY marker and HTTP probes gate activation.
The previous working directory remains available for rollback.

## Limits

Dense evidence graphs can still require horizontal navigation on phones. The overview
is a repository architecture view, not live service discovery. The pre-existing
entry.module.css flex alignment warning remains outside the modified page surfaces.
