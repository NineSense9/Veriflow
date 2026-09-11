"use client";

import { Background, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

type Ent = { id: string; type: string; label: string };
type Rel = { source_id: string; target_id: string; relation_type: string };

function ENode({ data }: NodeProps) {
  const payload = data as { label: string; kind: string; dim?: boolean; selected?: boolean };
  return (
    <div className={`rf-node ${payload.selected ? "selected" : ""} ${payload.dim ? "dim" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <span className="rf-kind">{payload.kind}</span>
      <strong>{payload.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { kind: ENode };

export default function EvidenceGraphView({
  entities,
  relations,
  focusId,
}: {
  entities: Ent[];
  relations: Rel[];
  focusId?: string;
}) {
  const { nodes, edges } = useMemo(() => {
    const keep = new Set<string>();
    if (focusId) {
      keep.add(focusId);
      for (let hop = 0; hop < 2; hop += 1) {
        for (const rel of relations) {
          if (keep.has(rel.source_id)) keep.add(rel.target_id);
          if (keep.has(rel.target_id)) keep.add(rel.source_id);
        }
      }
    }
    const shown = focusId ? entities.filter((e) => keep.has(e.id)).slice(0, 28) : entities.slice(0, 28);
    const ids = new Set(shown.map((e) => e.id));
    const byType: Record<string, number> = {};
    const nodes = shown.map((ent) => {
      const col = ["Requirement", "Constraint", "Algorithm", "WorkflowNode", "Issue", "Counterexample", "RuntimeEvent", "VerificationRun"].indexOf(ent.type);
      const x = 24 + Math.max(col, 0) * 170;
      const row = byType[ent.type] || 0;
      byType[ent.type] = row + 1;
      return {
        id: ent.id,
        type: "kind" as const,
        position: { x, y: 24 + row * 88 },
        data: {
          label: ent.label.slice(0, 28),
          kind: ent.type,
          selected: ent.id === focusId,
          dim: Boolean(focusId) && ent.id !== focusId && !keep.has(ent.id),
        },
      };
    });
    const edges = relations
      .filter((rel) => ids.has(rel.source_id) && ids.has(rel.target_id))
      .slice(0, 40)
      .map((rel, index) => ({
        id: `r${index}`,
        source: rel.source_id,
        target: rel.target_id,
        label: rel.relation_type,
        style: { stroke: "var(--graph-edge)", strokeWidth: 1 },
      }));
    return { nodes, edges };
  }, [entities, relations, focusId]);

  if (!entities.length) {
    return <p className="ghost">无 Evidence Graph。</p>;
  }

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}>
      <Background color="var(--graph-grid)" gap={20} size={1} />
    </ReactFlow>
  );
}
