export type EvidenceEntity = { id: string; type: string; label: string };
export type EvidenceRelation = { source_id: string; target_id: string; relation_type: string };

const TYPES = ["Issue", "Constraint", "WorkflowNode", "RuntimeEvent", "Algorithm", "Counterexample", "Requirement", "VerificationRun", "WorkflowEdge"];

export function selectEvidenceSubgraph(entities: EvidenceEntity[], relations: EvidenceRelation[], focusId?: string) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  if (!focusId || byId.get(focusId)?.type !== "Issue") return { entities: [], relations: [] };
  const keep = new Set([focusId]);
  let frontier = new Set([focusId]);
  for (let hop = 0; hop < 2; hop++) {
    const next = new Set<string>();
    for (const relation of relations) {
      for (const [source, target] of [[relation.source_id, relation.target_id], [relation.target_id, relation.source_id]]) {
        if (!frontier.has(source) || !byId.has(target) || keep.has(target)) continue;
        // These hubs describe the entire run; traversing them introduces unrelated issues.
        if (["VerificationRun", "Requirement", "Algorithm"].includes(byId.get(source)!.type)) continue;
        if (byId.get(target)!.type === "Issue" && target !== focusId) continue;
        next.add(target);
      }
    }
    next.forEach((id) => keep.add(id));
    frontier = next;
  }
  return {
    entities: entities.filter((entity) => keep.has(entity.id)),
    relations: relations.filter((relation) => keep.has(relation.source_id) && keep.has(relation.target_id)),
  };
}

export function layoutEvidence(entities: EvidenceEntity[]) {
  const types = [...TYPES.filter((type) => entities.some((entity) => entity.type === type)),
    ...Array.from(new Set(entities.map((entity) => entity.type))).filter((type) => !TYPES.includes(type)).sort()];
  const columns = types.map((type) => entities.filter((entity) => entity.type === type).sort((a, b) => a.id.localeCompare(b.id)));
  const maxRows = Math.max(1, ...columns.map((column) => column.length));
  return {
    maxRows, maxDepth: columns.length, nodeCount: entities.length,
    nodes: columns.flatMap((column, col) => column.map((entity, row) => ({
      id: entity.id, type: "kind", position: { x: col * 220, y: ((maxRows - column.length) / 2 + row) * 132 },
      style: { width: 176, height: 100 },
      data: { label: entity.label, kind: entity.type, selected: entity.type === "Issue" },
    }))),
  };
}
