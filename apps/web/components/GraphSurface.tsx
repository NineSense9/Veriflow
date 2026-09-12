"use client";

import { ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, type Node, type Edge, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useEffects, effectsAllowScan } from "@/lib/effects";
import { dagFrameHeight } from "@/lib/ir-flow";
import "./graph-surface.css";

export type GraphHandle = { fitAll: () => void; focusNodes: (ids: string[]) => void; focusPath: (ids: string[]) => void; mode: () => "all" | "focus" };
type Props = { nodes: Node[]; edges: Edge[]; nodeTypes: NodeTypes; layoutKey: string; label: string; onSelectNode?: (id: string) => void; height?: number; };

const View = forwardRef<GraphHandle, Props & { width: number; frameHeight: number }>(function View({ nodes, edges, nodeTypes, layoutKey, onSelectNode, width, frameHeight }, ref) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const { effects } = useEffects();
  const [focused, setFocused] = useState<string[]>([]);
  const mode = useRef<"all" | "focus">("all");
  const fit = useCallback((duration = 0) => { void fitView({ padding: 0.07, minZoom: 0.01, maxZoom: 1.15, duration }); }, [fitView]);
  useImperativeHandle(ref, () => ({
    fitAll() { mode.current = "all"; setFocused([]); fit(effectsAllowScan(effects) ? 180 : 0); },
    focusNodes(ids) { mode.current = "focus"; setFocused(ids); },
    focusPath(ids) { mode.current = "focus"; setFocused(ids); },
    mode: () => mode.current,
  }), [effects, fit]);
  useEffect(() => { setFocused([]); mode.current = "all"; }, [layoutKey]);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(frame);
  }, [ready, layoutKey, width, frameHeight, fit]);
  const shown = useMemo(() => nodes.map((node) => focused.length ? { ...node, data: { ...node.data, selected: focused.includes(node.id) || node.data.selected, dim: !focused.includes(node.id) && !node.data.selected } } : node), [nodes, focused]);
  return <ReactFlow nodes={shown} edges={edges} nodeTypes={nodeTypes}
    minZoom={0.01} maxZoom={1.6} panOnDrag zoomOnPinch zoomOnScroll={false} zoomOnDoubleClick={false}
    preventScrolling={false} nodesDraggable={false} nodesConnectable={false} elementsSelectable
    proOptions={{ hideAttribution: true }} onNodeClick={(_, node) => onSelectNode?.(node.id)} />;
});

export default forwardRef<GraphHandle, Props>(function GraphSurface(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const contentWidth = Math.max(176, ...props.nodes.map((node) => node.position.x + 176));
  const contentHeight = Math.max(100, ...props.nodes.map((node) => node.position.y + 100));
  const canvasWidth = width < 600 ? Math.max(width, Math.ceil(contentWidth * .72 + 32)) : width;
  const frameHeight = props.height ?? dagFrameHeight({ maxRows: Math.ceil(contentHeight / 132), nodeCount: props.nodes.length, maxDepth: Math.ceil(contentWidth / 220) }, canvasWidth);
  return <div className="graph-surface" ref={host} data-testid="graph-surface" role="region" aria-label={props.label} tabIndex={0}>
    <div className="graph-surface-canvas" style={{ width: canvasWidth, height: frameHeight }}>
      <ReactFlowProvider><View {...props} ref={ref} width={canvasWidth} frameHeight={frameHeight} /></ReactFlowProvider>
    </div>
  </div>;
});
