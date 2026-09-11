"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Threads from "@/components/reactbits/Threads";
import { api } from "@/lib/api";
import { effectsAllowBackground, useEffects } from "@/lib/effects";
import map from "@/data/architecture.json";

type ArchNode = (typeof map.nodes)[number];
type ArchEdge = (typeof map.edges)[number];

const LENSES = map.lenses as { id: string; label: string; nodeIds: string[] }[];
const STORY = map.story as { id: string; label: string; nodeIds: string[] }[];

export default function ArchitecturePage() {
  const { effects } = useEffects();
  const [lens, setLens] = useState("overview");
  const [storyStep, setStoryStep] = useState<number | null>(null);
  const [selected, setSelected] = useState<ArchNode | null>(null);
  const [commit, setCommit] = useState<string | null>(null);
  const showBg = effectsAllowBackground(effects);

  useEffect(() => {
    api
      .version()
      .then((v) => setCommit(v.git_commit && /^[0-9a-f]{7,40}$/i.test(v.git_commit) ? v.git_commit : null))
      .catch(() => setCommit(null));
  }, []);

  useEffect(() => {
    if (storyStep == null) return;
    const id = window.setTimeout(() => {
      setStoryStep((n) => {
        if (n == null) return n;
        if (n >= STORY.length - 1) return n;
        return n + 1;
      });
    }, 1400);
    return () => window.clearTimeout(id);
  }, [storyStep]);

  const focus = useMemo(() => {
    if (storyStep != null) return new Set(STORY[storyStep]?.nodeIds ?? []);
    const item = LENSES.find((l) => l.id === lens);
    if (!item || item.id === "overview" || !item.nodeIds.length) return null;
    return new Set(item.nodeIds);
  }, [lens, storyStep]);

  const blob = (path: string) => (commit ? `https://github.com/NineSense9/Veriflow/blob/${commit}/${path}` : null);

  return (
    <Shell>
      <main className="page page-arch vf-page arch-page">
        <header className="page-head tight">
          <p className="kicker">Architecture Explorer</p>
          <h1>{map.title}</h1>
          <p className="lead">Repository-backed system map. Lens highlights paths; the map does not re-layout.</p>
        </header>
        <div className="seg" role="group" aria-label="Lens">
          {LENSES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={lens === item.id && storyStep == null ? "on" : ""}
              onClick={() => {
                setStoryStep(null);
                setLens(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className={storyStep != null ? "on" : ""} onClick={() => setStoryStep(0)}>
            Story: AI → Proof → Repair
          </button>
        </div>
        {storyStep != null ? <p className="caption">Story beat: {STORY[storyStep]?.label}</p> : null}
        <div className="arch-stage">
          {showBg ? (
            <div className="arch-threads">
              <Threads color={[15 / 255, 118 / 255, 110 / 255]} amplitude={0.7} enableMouseInteraction={effects === "full"} />
            </div>
          ) : null}
          <svg viewBox={map.viewBox} className="arch-svg" role="img" aria-label="Authored system map">
            {map.edges.map((edge: ArchEdge) => {
              const a = map.nodes.find((n) => n.id === edge.from);
              const b = map.nodes.find((n) => n.id === edge.to);
              if (!a || !b) return null;
              const x1 = a.x + a.width / 2;
              const y1 = a.y + a.height / 2;
              const x2 = b.x + b.width / 2;
              const y2 = b.y + b.height / 2;
              const dim = Boolean(focus) && !(focus!.has(edge.from) && focus!.has(edge.to));
              const hot = focus && (focus.has(edge.from) || focus.has(edge.to));
              return (
                <g key={`${edge.from}-${edge.to}`} opacity={dim ? 0.14 : hot ? 1 : 1}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className={`arch-edge ${edge.kind}`} />
                </g>
              );
            })}
            {map.nodes.map((node: ArchNode) => {
              const dim = focus && !focus.has(node.id);
              const on = selected?.id === node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  opacity={dim ? 0.22 : 1}
                  className={`arch-node ${node.kind} ${on ? "on" : ""}`}
                  onClick={() => setSelected(node)}
                  role="button"
                  tabIndex={0}
                >
                  <rect width={node.width} height={node.height} rx={10} />
                  <text x={12} y={28} className="arch-title">
                    {node.title}
                  </text>
                  <text x={12} y={50} className="arch-layer">
                    {node.layer}
                    {node.algorithm ? ` · ${node.algorithm}` : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {selected ? (
          <aside className="arch-drawer">
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
            <dl className="kv">
              <div>
                <dt>AI role</dt>
                <dd>{selected.aiRole}</dd>
              </div>
              <div>
                <dt>Verifier role</dt>
                <dd>{selected.verifierRole}</dd>
              </div>
              <div>
                <dt>Complexity</dt>
                <dd>{selected.complexity}</dd>
              </div>
            </dl>
            <ul className="action-list">
              {selected.sourcePaths.map((path) => {
                const href = blob(path);
                return (
                  <li key={path}>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">
                        {path}
                      </a>
                    ) : (
                      <span className="mono">{path}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!commit ? <p className="caption">Source links hidden: build commit unknown (never /blob/main/).</p> : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
              Close
            </button>
          </aside>
        ) : null}
      </main>
    </Shell>
  );
}
