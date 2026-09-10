import type { Edge, Node } from "@xyflow/react";
import type { ComposeError, WorkflowIR } from "@/lib/api";

export function irToFlow(
  ir: WorkflowIR,
  errors: ComposeError[],
  highlight?: { nodes: string[]; path: string[] },
): { nodes: Node[]; edges: Edge[] } {
  const errorIds = new Set(errors.map((item) => item.node_id).filter(Boolean) as string[]);
  const selected = new Set(highlight?.nodes ?? []);
  const pathSet = new Set(highlight?.path ?? []);
  const indeg = new Map<string, number>();
  ir.nodes.forEach((node) => indeg.set(node.id, 0));
  const outgoing = new Map<string, string[]>();
  ir.edges.forEach((edge) => {
    indeg.set(edge.to, (indeg.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
  });
  const level = new Map<string, number>();
  const queue = ir.nodes.filter((node) => (indeg.get(node.id) || 0) === 0).map((node) => node.id);
  queue.forEach((id) => level.set(id, 0));
  const remaining = new Map(indeg);
  while (queue.length) {
    const current = queue.shift() as string;
    for (const next of outgoing.get(current) || []) {
      level.set(next, Math.max(level.get(next) || 0, (level.get(current) || 0) + 1));
      remaining.set(next, (remaining.get(next) || 1) - 1);
      if ((remaining.get(next) || 0) === 0) queue.push(next);
    }
  }
  const slots = new Map<number, number>();
  const nodes: Node[] = ir.nodes.map((node) => {
    const col = level.get(node.id) || 0;
    const row = slots.get(col) || 0;
    slots.set(col, row + 1);
    const label =
      node.kind === "tool"
        ? node.tool || node.id
        : node.kind === "guard"
          ? node.expr || node.id
          : node.kind === "human_gate"
            ? "审题门"
            : node.id;
    return {
      id: node.id,
      type: "kind",
      position: { x: 40 + col * 230, y: 40 + row * 110 },
      data: {
        label,
        kind: node.kind,
        error: errorIds.has(node.id),
        selected: selected.has(node.id) || pathSet.has(node.id),
        onPath: pathSet.has(node.id),
      },
    };
  });
  const edges: Edge[] = ir.edges.map((edge, index) => ({
    id: `e${index}`,
    source: edge.from,
    target: edge.to,
    style:
      pathSet.has(edge.from) && pathSet.has(edge.to)
        ? { stroke: "var(--wa)", strokeWidth: 2 }
        : undefined,
  }));
  return { nodes, edges };
}
