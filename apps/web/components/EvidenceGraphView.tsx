"use client";

import { Handle, Position, MarkerType, type NodeProps } from "@xyflow/react";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import GraphSurface, { type GraphHandle } from "./GraphSurface";
import { selectEvidenceSubgraph, layoutEvidence, type EvidenceEntity, type EvidenceRelation } from "@/lib/evidence-layout";

function EvidenceNode({ data }: NodeProps) {
  const payload = data as { label: string; kind: string; selected?: boolean };
  return <div title={payload.label} className={`rf-node ${payload.selected ? "selected" : ""}`}>
    <Handle type="target" position={Position.Left} /><span className="rf-kind">{payload.kind}</span>
    <strong>{payload.label}</strong><Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { kind: EvidenceNode };

export default forwardRef<GraphHandle, { entities: EvidenceEntity[]; relations: EvidenceRelation[]; focusId?: string }>(function EvidenceGraphView({ entities, relations, focusId }, ref) {
  const surface = useRef<GraphHandle>(null);
  useImperativeHandle(ref, () => ({ fitAll: () => surface.current?.fitAll(), focusNodes: (ids) => surface.current?.focusNodes(ids), focusPath: (ids) => surface.current?.focusPath(ids), mode: () => surface.current?.mode() || "all" }), []);
  const graph = useMemo(() => selectEvidenceSubgraph(entities, relations, focusId), [entities, relations, focusId]);
  const layout = useMemo(() => layoutEvidence(graph.entities), [graph.entities]);
  const edges = useMemo(() => graph.relations.map((relation, index) => ({
    id: `r${index}`, source: relation.source_id, target: relation.target_id,
    type: "smoothstep", label: relation.relation_type, labelStyle: { fill: "var(--text-2)", fontSize: 9 }, labelBgStyle: { fill: "var(--surface)" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--graph-edge)" },
    style: { stroke: "var(--graph-edge)", strokeWidth: 1.5 },
  })), [graph.relations]);
  if (!graph.entities.length) return <div className="graph-empty" role="status">当前问题没有可用证据图</div>;
  return <>
    <GraphSurface key={focusId} ref={surface} nodes={layout.nodes} edges={edges} nodeTypes={nodeTypes}
      layoutKey={JSON.stringify([focusId, graph.entities, graph.relations])} label="当前问题局部证据链" />
    <p className="graph-view-note">当前问题 · 两跳证据 · {graph.entities.length} 个实体 / {graph.relations.length} 条关系</p>
  </>;
});
