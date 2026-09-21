import type { Edge, Node } from "@xyflow/react";
import type { ComposeError, WorkflowIR } from "@/lib/api";

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 100;
export const COLUMN_STEP = 220;
export const ROW_STEP = 132;

export const TOOL_NAMES_ZH: Record<string, string> = {
  test_generator: "AI 测资生成",
  publish_problem: "题目发布入库",
  solution_runner: "标程运行验证",
  validator: "数据合法性校验",
  checker: "特判器评测",
  notify_1: "助教通知",
};

export const KIND_BADGE_ZH: Record<string, string> = {
  tool: "工具 · TOOL",
  guard: "守卫 · GUARD",
  branch: "分支 · BRANCH",
  human_gate: "人工门 · GATE",
  notify: "通知 · NOTIFY",
};

export function irToFlow(
  ir: WorkflowIR,
  errors: ComposeError[],
  highlight?: { nodes: string[]; path: string[] },
  failing?: string[],
  traceBreakFrom?: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const errorIds = new Set(
    [
      ...errors.map((item) => item.node_id).filter(Boolean),
      ...(failing ?? []),
    ] as string[],
  );
  const selected = new Set(highlight?.nodes ?? []);
  const pathSet = new Set(highlight?.path ?? []);
  const indeg = new Map<string, number>();
  ir.nodes.forEach((node) => indeg.set(node.id, 0));
  const outgoing = new Map<string, string[]>();
  ir.edges.filter((edge) => indeg.has(edge.from) && indeg.has(edge.to)).forEach((edge) => {
    indeg.set(edge.to, (indeg.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
  });
  const level = new Map<string, number>();
  const queue = ir.nodes.filter((node) => (indeg.get(node.id) || 0) === 0).map((node) => node.id);
  queue.forEach((id) => level.set(id, 0));
  const remaining = new Map(indeg);
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift() as string;
    visited.add(current);
    for (const next of outgoing.get(current) || []) {
      level.set(next, Math.max(level.get(next) || 0, (level.get(current) || 0) + 1));
      remaining.set(next, (remaining.get(next) || 1) - 1);
      if ((remaining.get(next) || 0) === 0) queue.push(next);
    }
  }
  // Invalid/cyclic input is still useful to inspect: retain it without overlapping nodes.
  let fallbackColumn = visited.size ? Math.max(...Array.from(level.values())) + 1 : 0;
  for (const node of ir.nodes) {
    if (!visited.has(node.id)) level.set(node.id, fallbackColumn++);
  }
  const counts = new Map<number, number>();
  for (const node of ir.nodes) counts.set(level.get(node.id) || 0, (counts.get(level.get(node.id) || 0) || 0) + 1);
  const maxRows = Math.max(1, ...Array.from(counts.values()));
  const slots = new Map<number, number>();
  const nodes: Node[] = ir.nodes.map((node) => {
    const col = level.get(node.id) || 0;
    const row = slots.get(col) || 0;
    slots.set(col, row + 1);
    const zhTitle =
      node.kind === "tool"
        ? (TOOL_NAMES_ZH[node.tool || ""] || node.tool || node.id)
        : node.kind === "guard"
          ? "范围守卫"
          : node.kind === "human_gate"
            ? "专家审题门"
            : node.kind === "branch"
              ? (node.id === "if_pay" ? "支付分支" : "条件分支")
              : (node.id === "notify_1" ? "助教通知" : node.id);
    const zhSub =
      node.kind === "tool"
        ? (node.tool || node.id)
        : node.kind === "guard"
          ? (node.expr || node.id)
          : node.kind === "branch"
            ? (node.expr || node.id)
            : node.id;
    const label = zhTitle !== zhSub ? `${zhTitle} (${zhSub})` : zhTitle;
    return {
      id: node.id,
      type: "kind",
      position: { x: col * COLUMN_STEP, y: ((maxRows - (counts.get(col) || 1)) / 2 + row) * ROW_STEP },
      style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      data: {
        label,
        zhTitle,
        zhSub,
        kindBadge: KIND_BADGE_ZH[node.kind] || node.kind,
        kind: node.kind,
        error: errorIds.has(node.id),
        status: errorIds.has(node.id) ? "fail" : selected.has(node.id) ? "sel" : "ok",
        selected: selected.has(node.id) || pathSet.has(node.id),
        onPath: pathSet.has(node.id),
        dim: Boolean(selected.size || pathSet.size) && !selected.has(node.id) && !pathSet.has(node.id),
      },
    };
  });
  const witnessEdges = new Set((highlight?.path || []).slice(1).map((id, i) => `${highlight!.path[i]}\u0000${id}`));
  const observed = new Set(highlight?.path || []);
  const edges: Edge[] = ir.edges.filter((edge) => indeg.has(edge.from) && indeg.has(edge.to)).map((edge, index) => {
    const broke = Boolean(traceBreakFrom) && edge.from === traceBreakFrom;
    return {
      id: `e${index}`,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      label: broke ? "× 轨迹在此终止" : undefined,
      labelStyle: broke ? { fill: "var(--error)", fontSize: 10 } : undefined,
      markerEnd: {
        type: "arrowclosed" as import("@xyflow/react").MarkerType,
        color: broke ? "var(--error)" : "var(--graph-edge)",
      },
      style: broke
        ? { stroke: "var(--error)", strokeWidth: 2, strokeDasharray: "5 4" }
        : witnessEdges.has(`${edge.from}\u0000${edge.to}`)
          ? { stroke: "var(--accent)", strokeWidth: 2.5 }
          : { stroke: "var(--graph-edge)", strokeWidth: 1.5, opacity: selected.size || pathSet.size ? 0.65 : 1 },
      className: broke ? "vf-trace-break" : undefined,
      data: { observed: observed.has(edge.to) },
    };
  });
  return { nodes, edges };
}

export function graphMetrics(ir: WorkflowIR) {
  const { nodes } = irToFlow(ir, []);
  let maxDepth = 0;
  let maxRows = 0;
  const colCount = new Map<number, number>();
  for (const node of nodes) {
    const col = Math.round(node.position.x / COLUMN_STEP);
    maxDepth = Math.max(maxDepth, col);
    colCount.set(col, (colCount.get(col) || 0) + 1);
  }
  for (const n of colCount.values()) maxRows = Math.max(maxRows, n);
  return { nodeCount: ir.nodes.length, maxDepth: maxDepth + 1, maxRows: maxRows || 1 };
}

export function dagFrameHeight(metrics: { maxRows: number; nodeCount: number; maxDepth?: number }, viewportWidth = 1000) {
  const width = Math.max(NODE_WIDTH, ((metrics.maxDepth ?? metrics.nodeCount) - 1) * COLUMN_STEP + NODE_WIDTH);
  const scale = Math.min(1.1, Math.max(0.35, (viewportWidth - 32) / width));
  return Math.max(260, Math.min(520, Math.ceil(((metrics.maxRows - 1) * ROW_STEP + NODE_HEIGHT) * scale + 48)));
}
