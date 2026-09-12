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
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { ComposeError, WorkflowIR } from "@/lib/api";
import { dagFrameHeight, graphMetrics, irToFlow } from "@/lib/ir-flow";

export type GraphHandle = {
  fitAll: () => void;
  focusNodes: (ids: string[]) => void;
  focusPath: (ids: string[]) => void;
  mode: () => "all" | "focus";
};

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

const Inner = forwardRef<
  GraphHandle,
  {
    nodes: Node[];
    edges: ReturnType<typeof irToFlow>["edges"];
    token: string;
    onSelectNode?: (id: string) => void;
  }
>(function Inner({ nodes, edges, token, onSelectNode }, ref) {
  const { fitView, getNodes } = useReactFlow();
  const ready = useNodesInitialized();
  const mode = useRef<"all" | "focus">("all");
  const focusIds = useRef<string[]>([]);
  const host = useRef<HTMLDivElement>(null);

  const apply = (duration = 0) => {
    if (mode.current === "focus" && focusIds.current.length) {
      const wanted = new Set(focusIds.current);
      fitView({
        nodes: getNodes().filter((n) => wanted.has(n.id)),
        padding: 0.32,
        maxZoom: 1.22,
        minZoom: 0.55,
        duration,
      });
      return;
    }
    fitView({ padding: 0.22, maxZoom: 1.15, minZoom: 0.55, duration });
  };

  useImperativeHandle(ref, () => ({
    fitAll() {
      mode.current = "all";
      focusIds.current = [];
      apply(240);
    },
    focusNodes(ids: string[]) {
      mode.current = "focus";
      focusIds.current = ids;
      apply(240);
    },
    focusPath(ids: string[]) {
      mode.current = "focus";
      focusIds.current = ids;
      apply(240);
    },
    mode: () => mode.current,
  }));

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => apply(0));
    return () => cancelAnimationFrame(frame);
  }, [ready, token]);

  useEffect(() => {
    const node = host.current?.parentElement;
    if (!node) return;
    let last = 0;
    const ro = new ResizeObserver(() => {
      if (node.clientWidth < 40 || node.clientHeight < 40) return;
      const key = Math.round(node.clientWidth) * 10000 + Math.round(node.clientHeight);
      if (key === last) return;
      last = key;
      apply(0);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [token]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.22, minZoom: 0.55, maxZoom: 1.15 }}
      minZoom={0.55}
      maxZoom={1.3}
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
      <div ref={host} className="rf-fit-probe" aria-hidden="true" />
    </ReactFlow>
  );
});

const ComposeCanvas = forwardRef<
  GraphHandle,
  {
    ir: WorkflowIR;
    errors: ComposeError[];
    highlight?: { nodes: string[]; path: string[] };
    failing?: string[];
    onSelectNode?: (id: string) => void;
    height?: number;
  }
>(function ComposeCanvas({ ir, errors, highlight, failing, onSelectNode, height }, ref) {
  const { nodes, edges } = useMemo(
    () => irToFlow(ir, errors, highlight, failing),
    [ir, errors, highlight, failing],
  );
  const token = `${ir.nodes.map((item) => item.id).join(",")}:${highlight?.nodes.join(",") ?? ""}:${highlight?.path.join(",") ?? ""}:${failing?.join(",") ?? ""}:${ir.edges.length}`;
  const frame = height ?? dagFrameHeight(graphMetrics(ir));
  return (
    <div className="vf-dag-frame" style={{ height: frame, minHeight: frame }}>
      <ReactFlowProvider>
        <Inner ref={ref} nodes={nodes} edges={edges} token={token} onSelectNode={onSelectNode} />
      </ReactFlowProvider>
    </div>
  );
});

export default ComposeCanvas;
export { dagFrameHeight, graphMetrics };
