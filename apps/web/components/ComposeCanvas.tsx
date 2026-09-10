"use client";

import { Background, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { ComposeError, WorkflowIR } from "@/lib/api";
import { irToFlow } from "@/lib/ir-flow";
import { readTheme } from "@/lib/theme";

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
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const sync = () => setDark(readTheme() === "dark");
    sync();
    window.addEventListener("vf-theme", sync);
    return () => window.removeEventListener("vf-theme", sync);
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background color={dark ? "#2a2e37" : "#e5e7eb"} gap={20} size={1} />
    </ReactFlow>
  );
}
