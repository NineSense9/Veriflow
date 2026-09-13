"use client";

import { Handle, Position, MarkerType, type NodeProps } from "@xyflow/react";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import GraphSurface, { type GraphHandle } from "./GraphSurface";
import { selectEvidenceSubgraph, layoutEvidence, attachAbsentEvents, evidenceRelationLabel, type EvidenceEntity, type EvidenceRelation } from "@/lib/evidence-layout";

function EvidenceNode({ data }: NodeProps) {
  const payload = data as { label: string; kind: string; selected?: boolean; absent?: boolean; onActivate?: () => void };
  return <div title={payload.label} tabIndex={0} role="button" aria-label={`${payload.kind}: ${payload.label}`} onClick={() => payload.onActivate?.()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); payload.onActivate?.(); } }} className={`rf-node evidence-node ${payload.selected ? "selected" : ""} ${payload.absent ? "absent" : ""}`}>
    <Handle type="target" position={Position.Left} /><span className="rf-kind">{payload.kind}</span>
    <strong>{payload.label}</strong><Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { kind: EvidenceNode };

export default forwardRef<GraphHandle, { entities: EvidenceEntity[]; relations: EvidenceRelation[]; focusId?: string; pathIds?: string[]; affectedNodeIds?: string[]; tracedNodeIds?: string[]; runtime?: boolean; onSelectEntity?: (entity: EvidenceEntity) => void }>(function EvidenceGraphView({ entities, relations, focusId, pathIds = [], affectedNodeIds = [], tracedNodeIds = [], runtime = false, onSelectEntity }, ref) {
  const surface = useRef<GraphHandle>(null);
  useImperativeHandle(ref, () => ({ fitAll: () => surface.current?.fitAll(), focusNodes: (ids) => surface.current?.focusNodes(ids), focusPath: (ids) => surface.current?.focusPath(ids), mode: () => surface.current?.mode() || "all" }), []);
  const graph = useMemo(() => {
    const sub = selectEvidenceSubgraph(entities, relations, focusId);
    return attachAbsentEvents(sub.entities, sub.relations, { affectedNodeIds, tracedNodeIds, runtime });
  }, [entities, relations, focusId, affectedNodeIds, tracedNodeIds, runtime]);
  const layout = useMemo(() => {
    const next = layoutEvidence(graph.entities, focusId, pathIds);
    return { ...next, nodes: next.nodes.map(node => ({ ...node, data: { ...node.data, onActivate: () => { const entity = graph.entities.find(item => item.id === node.id); if (entity) onSelectEntity?.(entity); } } })) };
  }, [graph.entities, focusId, pathIds, onSelectEntity]);
  const edges = useMemo(() => graph.relations.map((relation, index) => ({
    id: `r${index}`, source: relation.source_id, target: relation.target_id,
    type: "smoothstep", label: evidenceRelationLabel(relation.relation_type), labelStyle: { fill: "var(--text-2)", fontSize: 10 }, labelBgStyle: { fill: "var(--surface)" },
    markerEnd: { type: MarkerType.ArrowClosed, color: relation.relation_type === "REQUIRED" ? "var(--error)" : "var(--graph-edge)" },
    style: { stroke: relation.relation_type === "REQUIRED" ? "var(--error)" : "var(--graph-edge)", strokeWidth: 1.5, strokeDasharray: relation.relation_type === "REQUIRED" ? "5 4" : undefined },
  })), [graph.relations]);
  if (!graph.entities.length) return <div className="graph-empty" role="status">当前问题没有可用证据图</div>;
  const entityById = new Map(graph.entities.map(entity => [entity.id, entity]));
  const note = graph.absent.length
    ? `${graph.absent.join("、")} 必须发生，但记录里没有`
    : `当前问题证据链 · ${graph.entities.length} 个实体 / ${graph.relations.length} 条关系`;
  return <>
    <GraphSurface key={focusId} ref={surface} nodes={layout.nodes} edges={edges} nodeTypes={nodeTypes}
      layoutKey={JSON.stringify([focusId, pathIds, graph.entities, graph.relations])} label="当前问题证据链"
      onSelectNode={(id) => { const entity = entityById.get(id); if (entity) onSelectEntity?.(entity); }} />
    <p className="graph-view-note">{note}</p>
  </>;
});
