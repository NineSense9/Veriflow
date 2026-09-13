export type EvidenceEntity = { id: string; type: string; label: string; metadata?: Record<string, unknown> };

export function evidenceEntityAction(entity: EvidenceEntity) {
  if (entity.type === "Issue") return { kind: "issue" as const, id: entity.id.replace(/^issue:/, "") };
  if (entity.type === "WorkflowNode") return { kind: "workflow-node" as const, id: entity.id.replace(/^node:/, "") };
  return { kind: "detail" as const, id: entity.id };
}
