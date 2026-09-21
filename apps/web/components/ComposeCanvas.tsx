"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { forwardRef, useMemo } from "react";
import type { ComposeError, WorkflowIR } from "@/lib/api";
import { dagFrameHeight, graphMetrics, irToFlow } from "@/lib/ir-flow";
import GraphSurface, { type GraphHandle } from "./GraphSurface";

export type { GraphHandle } from "./GraphSurface";

function KindNode({ data }: NodeProps) {
  const payload = data as {
    label: string;
    kind: string;
    zhTitle?: string;
    zhSub?: string;
    kindBadge?: string;
    error: boolean;
    selected?: boolean;
    dim?: boolean;
  };
  return (
    <div
      title={payload.label}
      className={`rf-node kind-${payload.kind} ${payload.error ? "err" : ""} ${payload.selected ? "selected" : ""} ${payload.dim ? "dim" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <span className="rf-kind">{payload.kindBadge || payload.kind}{payload.error ? " · FAIL" : ""}</span>
      <strong>{payload.zhTitle || payload.label}</strong>
      {payload.zhSub ? (
        <span
          className="rf-sub"
          style={{
            display: "block",
            fontSize: "10px",
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginTop: "2px",
          }}
        >
          {payload.zhSub}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { kind: KindNode };

const ComposeCanvas = forwardRef<GraphHandle, {
  ir: WorkflowIR; errors: ComposeError[]; highlight?: { nodes: string[]; path: string[] }; failing?: string[];
  onSelectNode?: (id: string) => void; height?: number; traceBreakFrom?: string | null;
}>(function ComposeCanvas({ ir, errors, highlight, failing, onSelectNode, height, traceBreakFrom }, ref) {
  const { nodes, edges } = useMemo(
    () => irToFlow(ir, errors, highlight, failing, traceBreakFrom),
    [ir, errors, highlight, failing, traceBreakFrom],
  );
  // Selection is deliberately absent: it must never change the viewport.
  const layoutKey = JSON.stringify([ir.name, ir.nodes.map((node) => [node.id, node.kind, node.tool, node.expr]), ir.edges]);
  return <GraphSurface ref={ref} nodes={nodes} edges={edges} nodeTypes={nodeTypes} layoutKey={layoutKey}
    label="完整工作流链路" onSelectNode={onSelectNode} height={height} />;
});
export default ComposeCanvas;
export { dagFrameHeight, graphMetrics };
