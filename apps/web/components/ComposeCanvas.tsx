"use client";

import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "react";
import type { ComposeError, WorkflowIR } from "@/lib/api";
import { irToFlow } from "@/lib/ir-flow";

function KindNode({ data }: NodeProps) {
  const payload = data as {
    label: string;
    kind: string;
    error: boolean;
    selected?: boolean;
    dim?: boolean;
    status?: string;
  };
  return (
    <div
      className={`rf-node kind-${payload.kind} ${payload.error ? "err" : ""} ${payload.selected ? "selected" : ""} ${payload.dim ? "dim" : ""} ${payload.status ? `st-${payload.status}` : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <span className="rf-kind">
        {payload.kind}
        {payload.status && payload.status !== "ok" ? ` · ${payload.status}` : ""}
      </span>
      <strong>{payload.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { kind: KindNode };

function FitToGraph({ token }: { token: string }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      fitView({ padding: 0.18, minZoom: 0.55, maxZoom: 1.35, duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, token, fitView]);

  useEffect(() => {
    const node = host.current?.parentElement;
    if (!node) return;
    let last = 0;
    const ro = new ResizeObserver(() => {
      if (node.clientWidth < 40 || node.clientHeight < 40) return;
      const key = Math.round(node.clientWidth) * 10000 + Math.round(node.clientHeight);
      if (key === last) return;
      last = key;
      fitView({ padding: 0.18, minZoom: 0.55, maxZoom: 1.35, duration: 0 });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [fitView, token]);

  return <div ref={host} className="rf-fit-probe" aria-hidden="true" />;
}

export default function ComposeCanvas({
  ir,
  errors,
  highlight,
  failing,
  onSelectNode,
}: {
  ir: WorkflowIR;
  errors: ComposeError[];
  highlight?: { nodes: string[]; path: string[] };
  failing?: string[];
  onSelectNode?: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(
    () => irToFlow(ir, errors, highlight, failing),
    [ir, errors, highlight, failing],
  );
  const token = `${ir.nodes.map((item) => item.id).join(",")}:${highlight?.nodes.join(",") ?? ""}:${ir.edges.length}`;

  return (
    <ReactFlowProvider>
      <CanvasFrame
        nodes={nodes}
        edges={edges}
        token={token}
        onSelectNode={onSelectNode}
      />
    </ReactFlowProvider>
  );
}

function CanvasFrame({
  nodes,
  edges,
  token,
  onSelectNode,
}: {
  nodes: Node[];
  edges: ReturnType<typeof irToFlow>["edges"];
  token: string;
  onSelectNode?: (id: string) => void;
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18, minZoom: 0.55, maxZoom: 1.35 }}
      minZoom={0.55}
      maxZoom={1.35}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => onSelectNode?.(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
    >
      <FitToGraph token={token} />
    </ReactFlow>
  );
}
