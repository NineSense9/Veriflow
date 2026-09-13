"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Layers, X } from "lucide-react";
import Shell from "@/components/Shell";
import map from "@/data/architecture.json";
import { api } from "@/lib/api";
import "./architecture.css";

type ArchNode = (typeof map.nodes)[number];
const GROUPS = [
  { id: "input", name: "输入与编译", detail: "需求转化为可检查的工作流与规格", ids: ["web-ui", "api", "nl-ir", "spec"] },
  { id: "verification", name: "确定性验证", detail: "结构、语义、安全与数据依赖", ids: ["structural", "semantic", "safety", "dataflow"] },
  { id: "runtime", name: "运行时检查", detail: "执行轨迹、时序监视与偏差对齐", ids: ["runtime-mock", "runtime-monitor", "runtime-align"] },
  { id: "repair", name: "受约束修复", detail: "候选补丁经过守卫与再次验证", ids: ["ai-repair", "repair-guard", "incremental", "repair-select", "repair-loop"] },
  { id: "evidence", name: "证据与发布", detail: "发布门禁、反例、基准与历史记录", ids: ["gate", "explain", "mutate", "sqlite"] },
];

export default function ArchitecturePage() {
  const [group, setGroup] = useState("overview");
  const [selected, setSelected] = useState<ArchNode | null>(null);
  const [commit, setCommit] = useState<string | null>(null);
  useEffect(() => { api.version().then(v => setCommit(v.git_commit && /^[0-9a-f]{7,40}$/i.test(v.git_commit) ? v.git_commit : null)).catch(() => undefined); }, []);
  const groups = GROUPS.filter(item => group === "overview" || item.id === group);
  const edges = selected ? map.edges.filter(edge => edge.from === selected.id || edge.to === selected.id) : [];
  return <Shell><main className="page vf-page architecture-page">
    <header className="page-head tight"><p className="kicker">ARCHITECTURE / VERIFLOW</p><h1>系统地图</h1><p className="lead">从需求编译到证据与发布，查看各模块的职责与调用关系。</p></header>
    <nav className="architecture-nav" aria-label="架构分区">
      {[{ id: "overview", name: "总览" }, ...GROUPS].map(item => <button key={item.id} aria-pressed={group === item.id} onClick={() => { setGroup(item.id); setSelected(null); }}>{item.name}</button>)}
    </nav>
    <div className="architecture-bands">
      {groups.map((item) => <section className="architecture-band" key={item.id} aria-labelledby={`arch-${item.id}`}>
        <header><span className="architecture-number">0{GROUPS.indexOf(item)+1}</span><div><h2 id={`arch-${item.id}`}>{item.name}</h2><p>{item.detail}</p></div></header>
        <div className="architecture-modules">
          {item.ids.map(id => map.nodes.find(node => node.id === id)!).map(node => <button key={node.id} className="architecture-module" aria-pressed={selected?.id === node.id} onClick={() => setSelected(node)}>
            <span className="architecture-module-kind">{node.kind === "ai" ? "AI 提案" : node.kind === "store" ? "持久化" : "系统模块"}</span>
            <strong>{node.title}</strong><span className="architecture-algorithm">{node.algorithm || node.layer}</span><ArrowUpRight size={14} />
          </button>)}
        </div>
        {selected && item.ids.includes(selected.id) ? <div className="architecture-details" role="region" aria-label="模块详情">
          <header><h3><Layers size={16} />{selected.title}</h3><button className="icon-btn" title="关闭详情" aria-label="关闭详情" onClick={() => setSelected(null)}><X size={16} /></button></header>
          <p>{selected.description}</p>
          <dl><div><dt>AI 职责</dt><dd>{selected.aiRole}</dd></div><div><dt>验证器职责</dt><dd>{selected.verifierRole}</dd></div><div><dt>复杂度</dt><dd>{selected.complexity}</dd></div></dl>
          <h4>直接关联</h4>
          {edges.length ? <ul className="architecture-relations">{edges.map(edge => <li key={`${edge.from}-${edge.to}`}>
            <button onClick={() => { setSelected(map.nodes.find(node => node.id === edge.from)!); setGroup("overview"); }}>{map.nodes.find(node => node.id === edge.from)?.title}</button><span><ArrowRight size={14} />{edge.label}</span>
            <button onClick={() => { const target = map.nodes.find(node => node.id === edge.to)!; setSelected(target); setGroup("overview"); }}>{map.nodes.find(node => node.id === edge.to)?.title}</button>
          </li>)}</ul> : <p>当前架构记录没有直接关联。</p>}
          {selected.algorithm ? <Link href={`/algorithms/${selected.algorithm}`} className="btn btn-sm">算法详情<ArrowUpRight size={14} /></Link> : null}
          <ul className="architecture-sources">{selected.sourcePaths.map(source => <li key={source}>{commit ? <a href={`https://github.com/NineSense9/Veriflow/blob/${commit}/${source}`} target="_blank" rel="noreferrer">{source}</a> : <code>{source}</code>}</li>)}</ul>
        </div> : null}
      </section>)}
    </div>
  </main></Shell>;
}
