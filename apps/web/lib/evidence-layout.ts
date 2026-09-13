export type EvidenceEntity = { id: string; type: string; label: string };
export type EvidenceRelation = { source_id: string; target_id: string; relation_type: string };

export const EVIDENCE_KIND_ZH: Record<string, string> = {
  Issue: "问题",
  Constraint: "约束",
  WorkflowNode: "工作流节点",
  RuntimeEvent: "运行事件",
  Algorithm: "算法",
  Counterexample: "反例",
  Requirement: "需求",
  VerificationRun: "核验运行",
  WorkflowEdge: "工作流边",
};

export const EVIDENCE_REL_ZH: Record<string, string> = {
  VIOLATES: "违反",
  INVOLVES: "涉及",
  DETECTED_BY: "检测自",
  DETECTED: "检测自",
  CONSTRAINS: "约束",
  FROM_REQUIREMENT: "来自需求",
  HAS_REQUIREMENT: "对应需求",
  HAS_EVENT: "轨迹",
  ON_NODE: "落在",
  PRODUCED_BY: "产生自",
  DERIVED_FROM: "派生自",
  CHECKS: "检查",
  CAUSED_BY: "起因",
  WITNESSES: "见证",
  MINIMIZES: "最小化",
};

export function evidenceKindLabel(type: string) {
  return EVIDENCE_KIND_ZH[type] || type;
}

export function evidenceRelationLabel(type: string) {
  return EVIDENCE_REL_ZH[type] || EVIDENCE_REL_ZH[type.toUpperCase()] || type;
}

function nodeEntityId(entities: EvidenceEntity[], nodeId: string) {
  return entities.find(
    (entity) =>
      entity.type === "WorkflowNode" &&
      (entity.id === nodeId || entity.id.endsWith(nodeId) || entity.label === nodeId || entity.label.endsWith(nodeId)),
  )?.id;
}

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
        if (["VerificationRun", "WorkflowEdge"].includes(byId.get(target)!.type)) continue;
        if (byId.get(source)!.type === "WorkflowNode" && !["RuntimeEvent", "Algorithm"].includes(byId.get(target)!.type)) continue;
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

export function storyOrder(entities: EvidenceEntity[], focusId?: string, pathIds: string[] = []) {
  const used = new Set<string>();
  const sequence: EvidenceEntity[] = [];
  const take = (id?: string) => {
    if (!id) return;
    const entity = entities.find((item) => item.id === id);
    if (!entity || used.has(entity.id)) return;
    sequence.push(entity);
    used.add(entity.id);
  };
  take(focusId);
  for (const entity of entities.filter((item) => item.type === "Constraint")) take(entity.id);
  for (const nodeId of pathIds) take(nodeEntityId(entities, nodeId));
  for (const type of ["WorkflowNode", "RuntimeEvent", "Algorithm", "Counterexample", "Requirement"]) {
    for (const entity of entities.filter((item) => item.type === type)) take(entity.id);
  }
  for (const entity of entities) take(entity.id);
  return sequence;
}

export function layoutEvidence(entities: EvidenceEntity[], focusId?: string, pathIds: string[] = []) {
  const sequence = storyOrder(entities, focusId, pathIds);
  return {
    maxRows: 1,
    maxDepth: Math.max(1, sequence.length),
    nodeCount: sequence.length,
    nodes: sequence.map((entity, col) => ({
      id: entity.id,
      type: "kind",
      position: { x: 16 + col * 196, y: 28 },
      style: { width: 168, height: 88 },
      data: {
        label: entity.label,
        kind: evidenceKindLabel(entity.type),
        selected: entity.id === focusId || entity.type === "Issue",
      },
    })),
  };
}
