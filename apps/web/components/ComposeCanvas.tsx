"use client";

import { Background, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { ComposeError, WorkflowIR } from "@/lib/api";
import { irToFlow } from "@/lib/ir-flow";

function KindNode({ data }: NodeProps) {
  const payload = data as { label: string; kind: string; error: boolean };
  return (
    <div className={`rf-node kind-${payload.kind} ${payload.error ? "err" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <span className="rf-kind">{payload.kind}</span>
      <strong>{payload.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { kind: KindNode };

export default function ComposeCanvas({
  ir,
  errors,
}: {
  ir: WorkflowIR;
  errors: ComposeError[];
}) {
  const { nodes, edges } = useMemo(() => irToFlow(ir, errors), [ir, errors]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#2a2b24" gap={18} />
    </ReactFlow>
  );
}
