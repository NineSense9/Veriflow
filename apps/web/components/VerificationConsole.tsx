"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  AlgorithmRecord,
  CandidateEvaluation,
  RepairCandidate,
  VerifyIssue,
  VerifySession,
  WorkflowIR,
} from "@/lib/api";
import { DIM_META, dimLabel, gateWhy } from "@/lib/status";
import StatusChip from "@/components/StatusChip";
import Stepper, { Step } from "@/components/reactbits/Stepper";
import MagicBento from "@/components/reactbits/MagicBento";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import AnimatedList from "@/components/reactbits/AnimatedList";
import { ArrowDownToLine, ArrowRight, GitBranch, Maximize2, Play, ShieldCheck, WandSparkles } from "lucide-react";
import GridScan from "@/components/reactbits/GridScan";
import RuntimeReplay from "@/components/RuntimeReplay";
import { effectsAllowScan, useEffects } from "@/lib/effects";
import { setAmbientActivity } from "@/lib/ambient-activity";
import ComposeCanvas, { type GraphHandle } from "@/components/ComposeCanvas";
import { matchingIssueNodes } from "./verification-selection";
import { categoryLabel, demoTitle, pipelineLabel } from "@/lib/ui-zh";
import { algorithmCopy } from "@/lib/algorithm-copy-zh";
import { evidenceKindLabel } from "@/lib/evidence-layout";
import { downloadSessionEvidence } from "@/lib/evidence-export";
import { shouldLoadDemoWhenOpening } from "@/lib/session-selection";
import { evidenceEntityAction } from "./evidence-interaction";
import "./verification-workbench.css";
const EvidenceGraphView = dynamic(() => import("@/components/EvidenceGraphView"), { ssr: false });

function chip(status: string) {
  return <StatusChip value={status} />;
}

function nodeOf(issue: VerifyIssue) {
  return issue.affected_nodes?.[0] || issue.minimized_nodes?.[0] || "—";
}

export default function VerificationConsole({
  initialDemo = "case4_runtime",
  initialSession,
  latestOnOpen = false,
  tour = false,
}: {
  initialDemo?: string;
  initialSession?: VerifySession | null;
  latestOnOpen?: boolean;
  tour?: boolean;
}) {
  const [demos, setDemos] = useState<{ id: string; title: string; kind: string }[]>([]);
  const [session, setSession] = useState<VerifySession | null>(null);
  const [history, setHistory] = useState<
    {
      id: number;
      created_at: string;
      workflow_name: string;
      status: string;
      issue_count: number;
      coverage: number;
      runtime_status: string;
      gate_ready: string;
      latency_ms: number;
    }[]
  >([]);
  const [selected, setSelected] = useState<VerifyIssue | null>(null);
  const [pipe, setPipe] = useState<string | null>(null);
  const [matrixCell, setMatrixCell] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [compare, setCompare] = useState<{
    resolved: string[];
    new: string[];
    unchanged: string[];
    left_status: string;
    right_status: string;
    left_gate: string;
    right_gate: string;
  } | null>(null);
  const [graphMode, setGraphMode] = useState<"workflow" | "evidence">("workflow");
  const [demoId, setDemoId] = useState(initialDemo);
  const [origin, setOrigin] = useState<VerifySession | null>(null);
  const [nodeNote, setNodeNote] = useState("");
  const { prefs, effects } = useEffects();
  const graphRef = useRef<GraphHandle>(null);
  const evidenceRef = useRef<GraphHandle>(null);
  const panAfterApply = useRef(false);
  const [focused, setFocused] = useState("");
  const [scan, setScan] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [entityDetail, setEntityDetail] = useState<{ type: string; label: string; id: string; metadata?: Record<string, unknown> } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const requestId = useRef(0);
  const [view, setView] = useState("workflow");
  const graphSection = useRef<HTMLElement>(null);
  const findingsSection = useRef<HTMLElement>(null);
  const repairSection = useRef<HTMLDetailsElement>(null);
  const repairButton = useRef<HTMLButtonElement>(null);
  const [repair, setRepair] = useState<{
    improved: boolean;
    patch_operations?: number;
    changed_nodes?: number;
    changed_edges?: number;
    candidates_generated?: number;
    candidates_rejected_guard?: number;
    candidates_rejected_incremental?: number;
    candidates_fully_verified?: number;
    used_full_fallback?: boolean;
    reevaluated_constraints?: number;
    total_constraints?: number;
    affected_verifiers?: string[];
    impact_reason?: string;
    selected_candidate_id?: string | null;
    final_decision?: string;
    candidates?: RepairCandidate[];
    evaluations?: CandidateEvaluation[];
    initial?: { status: string; issues?: VerifyIssue[]; dimensions?: { name: string; status: string; issue_count: number }[] };
    final: { status: string; issues?: VerifyIssue[]; dimensions?: { name: string; status: string; issue_count: number }[] };
    steps: { reason: string; patches: { operation: string; source?: string | null; target?: string | null; node_id?: string | null; reason?: string }[] }[];
  } | null>(null);

  function focusIssue(issue: VerifyIssue | null, nodeId?: string, pan = true) {
    setSelected(issue);
    setGraphMode("workflow");
    const ids = issue ? matchingIssueNodes(issue, session?.ir.nodes || []) : nodeId ? [nodeId] : [];
    setNodeNote(issue && !ids.length ? "当前问题没有匹配的工作流节点；请查看预期、实际和证据。" : "");
    setFocused(ids.length ? (pan ? ids.join(" → ") : nodeId || ids[0]) : "");
    if (!pan) return;
    if (ids.length) graphRef.current?.focusPath(ids);
    else graphRef.current?.fitAll();
  }

  function apply(next: VerifySession, opts?: { keepOrigin?: boolean }) {
    setSession(next);
    const firstIssue = next.static.issues[0] ?? next.runtime_findings?.[0] ?? null;
    setSelected(firstIssue);
    setFocused("");
    setCandidateId("");
    if (!opts?.keepOrigin) {
      setOrigin(next.repair_origin ?? next);
      setRepair(next.repair ?? null);
    }
    setCompare(null);
    setNodeNote(firstIssue && !matchingIssueNodes(firstIssue, next.ir.nodes).length ? "当前问题没有匹配的工作流节点；请查看预期、实际和证据。" : "");
    setPipe(next.pipeline.find((step) => step.status !== "PASS")?.id ?? next.pipeline[0]?.id ?? null);
    setGraphMode("workflow");
    const ids = firstIssue ? matchingIssueNodes(firstIssue, next.ir.nodes) : [];
    setFocused(ids.join(" → "));
    panAfterApply.current = Boolean(ids.length);
  }

  async function loadDemo(id: string) {
    if (busy) return;
    const request = ++requestId.current;
    setBusy(id);
    setDemoId(id);
    setError("");
    setScan(true);
    setAmbientActivity("executing");
    try {
      const next = await api.reportSession({ demo: id });
      if (request !== requestId.current) return;
      apply(next);
      const hist = await api.reportHistory(20);
      if (request === requestId.current) setHistory(hist.runs);
    } catch (err) {
      if (request === requestId.current) setError((err as Error).message);
    } finally {
      if (request === requestId.current) {
        setBusy("");
        setInitialLoading(false);
        setScan(false);
        setAmbientActivity("idle");
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);
    setError("");
    api.demos().then((data) => { if (!cancelled) setDemos(data.demos); }).catch(() => undefined);
    if (initialSession) {
      apply(initialSession);
      setInitialLoading(false);
      api.reportHistory(20).then((hist) => { if (!cancelled) setHistory(hist.runs); }).catch(() => undefined);
    } else if (latestOnOpen) {
      api.reportHistory(20).then(async (hist) => {
        if (cancelled) return;
        setHistory(hist.runs);
        const latestId = hist.runs[0]?.id;
        if (shouldLoadDemoWhenOpening({ hasLatestRun: Boolean(latestId) })) {
          await loadDemo(initialDemo);
          return;
        }
        const latest = await api.reportRun(latestId);
        if (cancelled) return;
        apply(latest);
        if (latest.ir?.name) setDemoId(latest.ir.name);
      }).catch((err: Error) => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setInitialLoading(false); });
    } else {
      loadDemo(initialDemo);
    }
    return () => { cancelled = true; requestId.current++; setAmbientActivity("idle"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDemo, initialSession, latestOnOpen, reload]);

  useEffect(() => {
    if (!session || graphMode !== "workflow" || !panAfterApply.current) return;
    const issue = session.static.issues[0] ?? session.runtime_findings?.[0];
    const ids = issue ? matchingIssueNodes(issue, session.ir.nodes) : [];
    const timer = window.setTimeout(() => {
      if (ids.length) graphRef.current?.focusPath(ids);
      panAfterApply.current = false;
    }, 160);
    return () => window.clearTimeout(timer);
  }, [session, graphMode]);

  const highlight = useMemo(() => {
    if (!selected) return undefined;
    const mini = session?.minimized.find((item) => item.issue_id === selected.id);
    const witness = mini?.witness_path.length ? mini.witness_path : selected.witness_path;
    const path = witness.map((id) => session?.ir.nodes.some((node) => node.id === id) ? id : session?.trace?.events.find((event) => String(event.event_index) === id)?.node_id || id);
    return {
      nodes: matchingIssueNodes(selected, session?.ir.nodes || []),
      path: path.filter((id) => session?.ir.nodes.some((node) => node.id === id)),
    };
  }, [selected, session]);

  const ir: WorkflowIR | null = session?.ir ?? null;
  const traceBreakFrom = (() => {
    if (!ir) return null;
    const events = session?.trace?.events;
    if (!Array.isArray(events) || events.length === 0) return null;
    const seen = events.map((event) => event.node_id).filter(Boolean);
    const last = seen[seen.length - 1];
    if (!last) return null;
    return ir.edges.some((edge) => edge.from === last && !seen.includes(edge.to)) ? last : null;
  })();
  const issues: VerifyIssue[] = [
    ...(session?.static.issues ?? []),
    ...((session?.runtime_findings ?? []) as VerifyIssue[]),
  ];
  const runtimeOnly = Boolean(session && !session.static.issues.length && session.runtime_findings?.length);
  const canRepair = Boolean(session?.run_id && session.runtime_context && !runtimeOnly);
  const root = session?.static.root_causes?.find((item) => item.id === selected?.root_cause_id);
  const nl =
    typeof session?.spec === "object" && session.spec && "source_nl" in session.spec
      ? String((session.spec as { source_nl?: string }).source_nl || "")
      : "";
  const goal =
    typeof session?.spec === "object" && session.spec && "goal" in session.spec
      ? String((session.spec as { goal?: string }).goal || "")
      : "";
  const traces = Array.isArray(
    (session?.spec as { source_traces?: { constraint_id: string; start: number | null; end: number | null; snippet: string }[] } | undefined)
      ?.source_traces,
  )
    ? (session?.spec as { source_traces: { constraint_id: string; start: number | null; end: number | null; snippet: string }[] })
        .source_traces
    : [];
  const selectedTrace = traces.find(
    (item) =>
      item.constraint_id === selected?.constraint_id ||
      item.constraint_id === selected?.code ||
      (selected?.id ? selected.id.includes(item.constraint_id) : false),
  );
  const graphNb = (() => {
    if (!session?.graph || !selected) return [];
    const rootId =
      session.graph.entities.find((item) => item.type === "Issue" && (item.label === selected.code || item.id.endsWith(selected.id)))
        ?.id;
    if (!rootId) return [];
    const keep = new Set([rootId]);
    for (let hop = 0; hop < 2; hop += 1) {
      for (const rel of session.graph.relations) {
        if (keep.has(rel.source_id)) keep.add(rel.target_id);
        if (keep.has(rel.target_id)) keep.add(rel.source_id);
      }
    }
    return session.graph.entities.filter((item) => keep.has(item.id)).slice(0, 24);
  })();

  const dimensions = [
    ...(session?.static.dimensions ?? []),
    session?.runtime
      ? { name: "runtime", status: session.runtime.status, issue_count: session.runtime.issues?.filter((item) => item.status === "FAIL").length ?? 0 }
      : null,
  ].filter(Boolean) as { name: string; status: string; issue_count: number }[];

  const specBasis =
    typeof session?.spec === "object" && session.spec && "compiler_basis" in session.spec
      ? String((session.spec as { compiler_basis?: string }).compiler_basis || "")
      : "";
  const trace = session?.traceability;
  const mini = selected && session ? session.minimized.find((item) => item.issue_id === selected.id) : undefined;
  const selectedNodes = selected ? matchingIssueNodes(selected, session?.ir.nodes || []) : [];
  const runtimeFinding = session?.runtime?.issues.find((item) => item.constraint_id === selected?.constraint_id || item.constraint_id === selected?.code);
  const selectedEvents = session?.trace?.events.filter((event) =>
    runtimeFinding?.trace_slice?.includes(event.event_index) || selectedNodes.includes(event.node_id) || selected?.witness_path?.includes(String(event.event_index)),
  ).map((event) => event.event_index) || [];
  function selectEvidenceEntity(entity: { id: string; type: string; label: string; metadata?: Record<string, unknown> }) {
    const action = evidenceEntityAction(entity);
    if (action.kind === "issue") {
      const hit = issues.find((issue) => issue.id === action.id || issue.code === entity.label || issue.constraint_id === entity.label || entity.id.endsWith(issue.id));
      if (hit) { focusIssue(hit); setEntityDetail(null); return; }
    }
    if (action.kind === "workflow-node") {
      const node = session?.ir.nodes.find(item => item.id === action.id);
      if (node) { setGraphMode("workflow"); graphRef.current?.focusPath([node.id]); setFocused(node.id); setEntityDetail(null); return; }
    }
    setEntityDetail(entity);
  }
  const scrollTo = (target: "workflow" | "evidence" | "repair") => {
    setView(target);
    if (target === "evidence") setGraphMode("evidence");
    if (target === "workflow") setGraphMode("workflow");
    let el: HTMLElement | null = target === "repair" ? null : graphSection.current;
    if (target === "repair") {
      if (repairSection.current) { repairSection.current.open = true; el = repairSection.current; }
      else el = repairButton.current;
    } else if (target === "evidence") {
      el = graphSection.current || findingsSection.current;
    }
    el?.scrollIntoView({ behavior: effectsAllowScan(effects) ? "smooth" : "instant", block: "nearest" });
    el?.focus({ preventScroll: true });
  };

  return (
    <div className="vf-console vf-workbench-console">
      <nav className="vf-story-nav" aria-label="证据工作区导航">
        <div className="vf-story-tabs">
          {[["workflow", "工作流"], ["evidence", "证据"], ["repair", "修复"]].map(([id, label], index) => (
            <button key={id} type="button" aria-current={view === id ? "location" : undefined} onClick={() => scrollTo(id as "workflow" | "evidence" | "repair")}>
              <span>0{index + 1}</span>{label}{index < 2 ? <ArrowRight size={13} /> : null}
            </button>
          ))}
        </div>
        <ol className="vf-story-rail" aria-label="评委三步">
          <li className={graphMode === "workflow" && view !== "repair" ? "is-active" : undefined}>
            <button type="button" onClick={() => scrollTo("workflow")}><span>1</span>拦住</button>
          </li>
          <li className={graphMode === "evidence" ? "is-active" : undefined}>
            <button type="button" onClick={() => scrollTo("evidence")}><span>2</span>缺席证据</button>
          </li>
          <li className={view === "repair" ? "is-active" : undefined}>
            <button type="button" onClick={() => scrollTo("repair")}><span>3</span>修复仍受约束</button>
          </li>
        </ol>
        <span className="vf-session-source"><ShieldCheck size={14} /> 确定性核验 · {initialLoading ? "读取中" : "已记录的结果"}</span>
      </nav>
      <div className="vf-toolbar vf-session-actions">
        <label className="vf-case-select">
          <span>核验案例</span>
          <select value={demoId} disabled={Boolean(busy) || initialLoading} onChange={(event) => setDemoId(event.target.value)}>
            {!demos.some((demo) => demo.id === demoId) ? <option value={demoId}>{demoId}</option> : null}
            {demos.map((demo) => <option key={demo.id} value={demo.id}>{demoTitle(demo.id, demo.title)}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-sm" disabled={Boolean(busy) || initialLoading || !demos.some((demo) => demo.id === demoId)} onClick={() => loadDemo(demoId)}><Play size={14} />{busy && busy !== "repair" ? "验证中…" : "运行案例"}</button>
        {session ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={Boolean(busy)}
            onClick={async () => {
              try {
                downloadSessionEvidence(session, "md");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <ArrowDownToLine size={14} />导出证据
          </button>
        ) : null}
        {session && issues.length ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            ref={repairButton}
            disabled={Boolean(busy) || !canRepair}
            onClick={async () => {
              setError("");
              setBusy("repair");
              setScan(true);
              setAmbientActivity("executing");
              try {
                const next = await api.repairReportRun(session.run_id!, prefs.aiRepair);
                apply(next);
                setHistory((await api.reportHistory(20)).runs);
                setView("repair");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy("");
                setScan(false);
                setAmbientActivity("idle");
              }
            }}
            data-click-fx="strong"
          >
            <WandSparkles size={14} />{busy === "repair" ? "修复中…" : "受约束修复"}
          </button>
        ) : null}
      </div>
      {session && issues.length ? (
        <p className="caption vf-repair-hint">
          {tour ? "演示第三步：" : ""}
          {runtimeOnly ? "运行时问题已定位，当前暂不支持自动修复。可切换「顺序失败」案例体验静态补丁与再验证；本次运行仍被门禁拦截。" : !canRepair ? "该历史记录缺少运行条件，请先重新运行案例，再执行修复。" : "受约束修复将针对当前缺陷生成最小补丁并执行守卫核验；再验证继承原始运行时条件，全量门禁就绪方可放行。"}
        </p>
      ) : null}
      {error ? (
        <p className="err" role="alert">
          {error}
          {latestOnOpen && !session ? <button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>重新加载</button> : null}
        </p>
      ) : null}
      {session ? (
        <>
          {session.parent_run_id ? (
            <p className="caption">
              本次为再验证，原始记录{" "}
              <Link href={`/report/runs/${session.parent_run_id}`}>#{session.parent_run_id}</Link>
            </p>
          ) : null}
          <section className="vf-verdict" aria-label="最终核验结论">
            <div className="vf-verdict-heading">
              <div><span className="kicker">验证记录 {session.run_id ? String(session.run_id).padStart(4, "0") : "—"} / {session.ir.name}</span><h2>{session.static.status === "PASS" && session.runtime?.status === "FAIL" ? "静态通过，运行时失败" : session.status === "FAIL" ? "发现问题，发布已拦截" : session.status === "PASS" ? "验证通过，证据已就绪" : "核验完成，仍有待确认项"}</h2></div>
              <div className="vf-verdict-chips"><span>核验 {chip(session.status)}</span><span>发布门禁 {chip(session.gate.ready)}</span></div>
            </div>
            <p className="caption">{gateWhy(dimensions.find((item) => item.name === "executable")?.status, session.runtime?.status, session.gate.ready) || "核验结果来自静态验证器与运行时记录。"}</p>
          </section>
          <Stepper
            labels={session.pipeline.map((step) => pipelineLabel(step.id, step.name))}
            className="vf-rb-stepper"
            hideFooter
            glowRunning={Boolean(busy) && effectsAllowScan(effects)}
            currentStep={Math.max(1, session.pipeline.findIndex((step) => step.id === pipe) + 1)}
            statuses={session.pipeline.map((step) => step.status)}
            onStepChange={(n) => setPipe(session.pipeline[n - 1]?.id ?? null)}
          >
            {session.pipeline.map((step) => (
              <Step key={step.id}>
                <p>
                  <strong>{pipelineLabel(step.id, step.name)}</strong> · {step.output_summary || "查看本步骤的核验记录"}
                </p>
                <p className="caption">
                  {step.kind === "deterministic" ? "确定性" : "AI 辅助"} · {step.algorithm_id} · {step.latency_ms.toFixed(1)}ms · 缓存{step.cache_status === "hit" ? "命中" : "未命中"} · 检查 {step.checks_executed} 项
                  {step.output_summary ? ` · ${step.output_summary}` : ""}
                </p>
              </Step>
            ))}
          </Stepper>
          <MagicBento gridClassName="vf-evidence-grid" enableSpotlight={false} enableBorderGlow={false} disableAnimations>
            <section className="vf-viz" ref={graphSection} tabIndex={-1} aria-label="工作流图">
              <div className="vf-toolbar vf-graph-toolbar">
                <h2><GitBranch size={16} /> {graphMode === "workflow" ? "工作流图" : "当前问题证据链"} {graphMode === "workflow" ? <span>{session.ir.nodes.length} 节点 · {session.ir.edges.length} 连线</span> : null}</h2>
                <button
                  type="button"
                  className={graphMode === "workflow" ? "btn btn-sm btn-primary" : "btn btn-sm"}
                  onClick={() => setGraphMode("workflow")}
                >
                  工作流
                </button>
                <button
                  type="button"
                  className={graphMode === "evidence" ? "btn btn-sm btn-primary" : "btn btn-sm"}
                  onClick={() => setGraphMode("evidence")}
                >
                  证据图
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label="适应画布"
                  title="适应画布"
                  onClick={() => {
                    (graphMode === "workflow" ? graphRef : evidenceRef).current?.fitAll();
                  }}
                >
                  <Maximize2 size={14} />
                </button>
                {focused && graphMode === "workflow" ? <span className="caption">反例路径: {focused}</span> : null}
              </div>
              <div className="vf-dag" style={{ position: "relative" }}>
                {scan && effectsAllowScan(effects) ? <GridScan active /> : null}
                {graphMode === "workflow" && ir ? (
                  <ComposeCanvas
                    ref={graphRef}
                    ir={ir}
                    errors={[]}
                    highlight={highlight}
                    failing={issues.flatMap((item) => item.affected_nodes || [])}
                    traceBreakFrom={traceBreakFrom}
                    onSelectNode={(id) => {
                      const hit = issues.find(
                        (item) => matchingIssueNodes(item, ir.nodes).includes(id),
                      );
                      setNodeNote(hit ? "" : `节点 ${id} 没有 finding。`);
                      if (hit) {
                        focusIssue(hit, id, false);
                        return;
                      }
                      const hop = ir.edges
                        .filter((edge) => edge.from === id || edge.to === id)
                        .flatMap((edge) => [edge.from, edge.to]);
                      graphRef.current?.focusNodes([...new Set([id, ...hop])]);
                      setSelected(null);
                      setFocused(id);
                    }}
                  />
                ) : session.graph ? (
                    <EvidenceGraphView
                      ref={evidenceRef}
                      entities={session.graph.entities}
                      relations={session.graph.relations}
                      focusId={
                        session.graph.entities.find(
                          (item) =>
                            selected && item.type === "Issue" && (item.label === selected.code || item.id.endsWith(selected.id)),
                        )?.id
                      }
                      pathIds={highlight?.path ?? selected?.witness_path ?? []}
                      affectedNodeIds={selected?.affected_nodes ?? []}
                      tracedNodeIds={(session.trace?.events || []).map((event) => event.node_id)}
                      runtime={selected?.category === "runtime" || selected?.id.startsWith("rt:")}
                      onSelectEntity={selectEvidenceEntity}
                    />
                ) : <div className="graph-empty" role="status">当前问题没有可用证据图</div>}
              </div>
              <div className="vf-trace-inline">
                <RuntimeReplay events={session.trace?.events || []} play={false} selectedEventIndices={selectedEvents} selectionKey={selected?.id || ""} />
              </div>
            </section>
            <aside className="vf-findings" ref={findingsSection} tabIndex={-1} aria-label="问题与证据">
              <div className="vf-issues-heading"><h2>问题定位</h2><span className="vf-count">{issues.length}</span></div>
              <p className="caption">
                共 {issues.length} · 静态 {session.static.issues.length} · 运行 {(session.runtime_findings ?? []).length}
              </p>
              {nodeNote ? <p className="caption">{nodeNote}</p> : null}
              {issues.length === 0 ? <p className="ghost">无 Issue。静态与运行时均未给出 FAIL。</p> : null}
              <div className="vf-issue-list" role="group" aria-label="选择核验问题">
                {issues.map((issue) => (
                  <button key={issue.id} type="button" className="vf-issue-option" aria-pressed={selected?.id === issue.id} onClick={() => focusIssue(issue)}>
                    {chip(issue.severity === "HIGH" || issue.severity === "CRITICAL" ? "FAIL" : issue.severity)}
                    <span><strong>{issue.title || issue.code}</strong><small>{issue.category} · {nodeOf(issue)}</small></span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              {selected ? (
                <section className="vf-current-issue" aria-label="当前问题证据" data-issue-id={selected.id}>
                  <SpotlightCard className="vf-evidence-spotlight">
                  <div className="vf-evidence-heading"><span>证据</span><span>{selected.detected_by || selected.category}</span></div>
                  <dl className="vf-kv vf-primary-evidence">
                    <div><dt>原因</dt><dd>{selected.title || selected.description || selected.code}</dd></div>
                    <div><dt>预期</dt><dd>{selected.expected ?? "未提供预期值"}</dd></div>
                    <div><dt>实际</dt><dd>{selected.actual ?? "未提供实际值"}</dd></div>
                    <div><dt>反例路径</dt><dd className="mono vf-witness-path" key={selected.id}>{(highlight?.path ?? selected.witness_path ?? []).length ? (highlight?.path ?? selected.witness_path).map((id, index) => <span key={`${id}-${index}`} style={{ animationDelay: `${index * 70}ms` }}>{index ? "→ " : ""}{id}</span>) : "无已记录反例路径"}</dd></div>
                  </dl>
                  </SpotlightCard>
                  <details className="vf-evidence-details"><summary>查看根因与完整证据</summary><dl className="vf-kv">
                    <div><dt>根因</dt><dd>{root?.summary ?? selected.root_cause_id ?? "—"}</dd></div>
                  <div>
                    <dt>最小反例</dt>
                    <dd>
                      {mini
                        ? `节点 ${mini.minimized_nodes.join(", ") || "—"} · 路径 ${(mini.witness_path || []).join(" → ") || "—"} · ${mini.globally_minimal ? "全局最小" : "近似切片，不保证全局最小"}`
                        : "反例最小化仅对静态问题运行"}
                    </dd>
                  </div>
                  <div>
                    <dt>最小化节点</dt>
                    <dd>{(selected.minimized_nodes ?? []).join(", ") || "—"}</dd>
                  </div>
                  <div>
                    <dt>检测算法</dt>
                    <dd>
                      <Link href={`/algorithms/${selected.detected_by || "graph.integrity"}`}>
                        {selected.detected_by || "—"} v{selected.algorithm_version || "—"}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>方法</dt>
                    <dd>{selected.verification_method ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>证据来源</dt>
                    <dd>{selected.evidence_source ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>修复建议</dt>
                    <dd>{selected.repair_hint ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>邻接</dt>
                    <dd>
                      {graphNb.map((ent) => (
                        <span key={ent.id} className="caption">
                          {evidenceKindLabel(ent.type)}:{ent.label}{" "}
                        </span>
                      ))}
                    </dd>
                  </div>
                  </dl></details>
                </section>
              ) : null}
              {entityDetail ? <section className="vf-entity-detail" aria-label="证据实体详情">
                <div className="vf-evidence-heading"><span>{evidenceKindLabel(entityDetail.type)}</span><span>{entityDetail.id}</span></div>
                <p>{entityDetail.label}</p>
                {entityDetail.metadata ? <dl className="vf-kv">{Object.entries(entityDetail.metadata).filter(([, value]) => value != null && value !== "").slice(0, 6).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl> : null}
              </section> : null}
              {session.ambiguity && session.ambiguity.status !== "CLEAR" ? (
                <p className="caption">
                  需求 {session.ambiguity.status} ({session.ambiguity.method})
                  {session.ambiguity.items[0] ? ` · ${session.ambiguity.items[0].reason}` : ""}
                </p>
              ) : null}
            </aside>
          </MagicBento>
          <dl className="vf-outcome-strip" aria-label="核验摘要">
            <div><dt>发布门禁</dt><dd>{chip(session.gate.ready)}</dd></div>
            <div><dt>运行偏差</dt><dd>{session.alignment.deviation_count}<small> 项偏差</small></dd></div>
            <div><dt>下一步</dt><dd><button type="button" onClick={() => scrollTo(issues.length ? "evidence" : "workflow")}>{issues.length ? "查看当前反例" : "检查工作流"}<ArrowRight size={15} /></button></dd></div>
          </dl>
          <details className="vf-disclosure"><summary>需求与编译依据</summary><div className="vf-disclosure-body">
          <section className="vf-req">
            <div>
              <h2>需求</h2>
              <p>
                {selectedTrace?.start != null && selectedTrace.end != null ? (
                  <>
                    {nl.slice(0, selectedTrace.start)}
                    <mark>{nl.slice(selectedTrace.start, selectedTrace.end)}</mark>
                    {nl.slice(selectedTrace.end)}
                  </>
                ) : (
                  nl || "（本次记录未带自然语言需求）"
                )}
              </p>
            </div>
            <dl className="vf-kv compact">
              <div>
                <dt>意图 / 规格</dt>
                <dd>{goal || "—"}</dd>
              </div>
              <div>
                <dt>编译器</dt>
                <dd>
                  {String((session.spec as { compiler?: string }).compiler || "—")}
                  {specBasis ? ` · ${specBasis}` : ""}
                </dd>
              </div>
              <div>
                <dt>工作流</dt>
                <dd>
                  {session.ir.name} · {session.ir.nodes.length} 个节点 · {session.ir.edges.length} 条连线
                </dd>
              </div>
            </dl>
          </section>

          <p className="caption">
            {session.cross.pattern} · {session.cross.story} · 工作流指纹 {session.workflow_hash}
            {session.node_coverage.unknown.length ? ` · 未支持节点 ${session.node_coverage.unknown.length}` : ""}
          </p>
          </div></details>
          {trace ? (
            <details className="vf-disclosure"><summary>需求覆盖</summary><div className="vf-disclosure-body">
              <p className="caption">
                覆盖 {trace.covered} · 失败 {trace.failed} · 歧义 {trace.ambiguous} · 未映射 {trace.unmapped}
                。覆盖率依据形式化规格约束与确定性验证结果严格统计。
              </p>
              <div className="vf-table-wrap">
                <table className="vf-matrix">
                  <thead>
                    <tr>
                      <th>条款</th>
                      <th>状态</th>
                      <th>节点</th>
                      <th>验证器</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.clauses.map((row) => (
                      <tr key={row.id} className={selected?.constraint_id === row.id || selected?.id === row.id ? "is-selected" : undefined}>
                        <td>
                          <button
                            type="button"
                            className="vf-cell"
                            onClick={() => {
                              const hit = issues.find(
                                (item) => item.constraint_id === row.id || row.nodes.some((nid) => item.affected_nodes?.includes(nid)),
                              );
                              focusIssue(hit ?? null, row.nodes[0]);
                              if (!hit) setNodeNote(row.nodes.length ? `条款 ${row.id} → ${row.nodes.join(", ")}` : row.text);
                            }}
                          >
                            {row.id} · {row.text}
                          </button>
                        </td>
                        <td>{chip(row.status)}</td>
                        <td>{row.nodes.join(", ") || "—"}</td>
                        <td>{row.verifier || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div></details>
          ) : null}

          <details className="vf-disclosure"><summary>验证维度 <span>独立判定与问题计数</span></summary><div className="vf-disclosure-body">
            <p className="caption">
              {gateWhy(
                dimensions.find((item) => item.name === "executable")?.status,
                session.runtime?.status,
                session.gate.ready,
              ) || "每维是独立判定，不是加权总分。「静态可达」看图结构，「运行时模拟」看模拟运行轨迹。"}
            </p>
            <div className="vf-dims">
              {dimensions.map((dim) => {
                const meta = DIM_META[dim.name] || { label: dimLabel(dim.name), hint: "" };
                return (
                  <article key={dim.name} className={`vf-dim ${dim.status}`}>
                    <header>
                      <span>{meta.label}</span>
                      {chip(dim.status)}
                    </header>
                    <p className="vf-dim-count">{dim.issue_count}</p>
                    <p className="caption">{meta.hint}</p>
                  </article>
                );
              })}
            </div>
          </div></details>

          <div className="vf-activity" role="status">
            <span className={busy ? "vf-activity-dot is-busy" : "vf-activity-dot"} aria-hidden="true" />
            <strong>{busy ? "请求处理中" : initialSession ? "历史核验记录" : "核验记录已就绪"}</strong>
            <span>编译 {specBasis || "heuristic"} · 静态 {session.static.status} · 运行时 {session.runtime?.status ?? "NOT_RUN"}</span>
          </div>
          <details className="vf-disclosure"><summary>验证活动 <span>已记录的阶段结果</span></summary><div className="vf-disclosure-body">
            <AnimatedList className="vf-event-list" showGradients={false} items={session.pipeline.map((step) => <div className="vf-event-row" key={step.id}><span>{pipelineLabel(step.id, step.name)}</span>{chip(step.status)}<span>{step.output_summary || step.algorithm_id}</span><small>{step.latency_ms.toFixed(1)} ms</small></div>)} />
          </div></details>
          {session.trace?.events?.length ? (
            <details className="vf-disclosure"><summary>已记录的运行回放 <span>{session.trace.events.length} 个事件 · 非重新执行</span></summary><div className="vf-disclosure-body"><RuntimeReplay events={session.trace.events} play={false} /></div></details>
          ) : null}
          {repair && origin ? (
            <details className="vf-disclosure vf-repair" ref={repairSection} tabIndex={-1} open={view === "repair"}><summary>受约束修复记录 <span>提案 → 守卫 → 再验证</span></summary><div className="vf-disclosure-body">
              <p className="vf-repair-decision"><strong>静态修复决策：{repair.final_decision || "—"}</strong> · {chip(repair.final.status)}</p>
              <p className="caption">
                AI 或规则只提出补丁。守卫拒绝 {repair.candidates_rejected_guard ?? 0} 个，增量拒绝 {repair.candidates_rejected_incremental ?? 0} 个。
                静态补丁检查 {repair.final.status}，完整再验证 {session.status}，发布门禁 {session.gate.ready}。补丁未因模型表态而自动获准入库。
                {origin.run_id ? ` 修复前 #${origin.run_id}` : ""}
                {session.run_id ? ` · 修复后 #${session.run_id}` : ""}。
              </p>
              {repair.candidates?.length ? (
                <div className="vf-candidates">
                  <div className="vf-candidate-options" role="group" aria-label="查看修复候选">
                    {repair.candidates.map((cand) => <button type="button" key={cand.id} className="vf-candidate-option" aria-pressed={(candidateId || repair.selected_candidate_id || repair.candidates?.[0]?.id) === cand.id} onClick={() => setCandidateId(cand.id)}>
                      <strong>{cand.id}</strong><span>{cand.source}{repair.selected_candidate_id === cand.id ? " · 服务端选中" : ""}</span>
                    </button>)}
                  </div>
                  {repair.candidates.filter((cand) => cand.id === (candidateId || repair.selected_candidate_id || repair.candidates?.[0]?.id)).map((cand) => <article className="vf-candidate-detail" key={cand.id}>
                    <h3>{cand.id} · 修复提案</h3><p>{cand.rationale || "未提供提案说明"}</p>
                    <ul>{cand.patches.map((patch, index) => <li key={index}><code>{patch.operation}</code> · {[patch.node_id, patch.source, patch.target].filter(Boolean).join(" → ") || "—"}{patch.reason ? ` · ${patch.reason}` : ""}</li>)}</ul>
                  </article>)}
                </div>
              ) : null}
              {repair.evaluations?.map((ev) => (
                <p key={ev.candidate_id} className="caption">
                  {ev.candidate_id}: {ev.stages.map((s) => `${s.name}=${s.status}`).join(" → ")}
                  {ev.accepted ? " · 已接受" : ` · ${ev.reject_reason || "已拒绝"}`}
                </p>
              ))}
              <p className="caption">
                修复决策 {repair.final_decision || "—"} · 选中候选 {repair.selected_candidate_id || "—"}
              </p>
              <p className="caption">
                守卫拒绝 {repair.candidates_rejected_guard ?? 0} · 增量检查拒绝{" "}
                {repair.candidates_rejected_incremental ?? 0} · 完整复验 {repair.candidates_fully_verified ?? 0}
                {repair.used_full_fallback ? " · 已回退至完整复验" : " · 增量子集检查"}
                {repair.affected_verifiers?.length ? ` · 重新运行 ${repair.affected_verifiers.join(", ")}` : ""}
                {repair.impact_reason ? ` · ${repair.impact_reason}` : ""}
              </p>
              <div className="vf-ba">
                <article>
                  <h3>修复前</h3>
                  <p>核验 {chip(origin.status)}</p>
                  <p>发布门禁 {chip(origin.gate.ready)}</p>
                  <p>运行时 {chip(origin.runtime?.status ?? "NOT_RUN")}</p>
                  <p className="caption">
                    问题数 {(origin.static.issues.length || 0) + (origin.runtime_findings?.length || 0)}
                  </p>
                </article>
                <article>
                  <h3>修复后</h3>
                  <p>核验 {chip(session.status)}</p>
                  <p>发布门禁 {chip(session.gate.ready)}</p>
                  <p>运行时 {chip(session.runtime?.status ?? "NOT_RUN")}</p>
                  <p className="caption">问题数 {issues.length}</p>
                </article>
                <article>
                  <h3>变化</h3>
                  <p className="caption">
                    静态 {repair.initial?.status || "—"} → {repair.final.status} ·{" "}
                    {repair.improved ? "已有改善" : "未改善"}
                  </p>
                  <p className="caption">
                    已解决{" "}
                    {Math.max(
                      0,
                      (origin.static.issues.length || 0) +
                        (origin.runtime_findings?.length || 0) -
                        issues.length,
                    )}{" "}
                    · 剩余 {issues.length}
                  </p>
                </article>
              </div>
              <div className="vf-table-wrap">
                <table className="vf-matrix">
                  <thead>
                    <tr>
                      <th>补丁</th>
                      <th>变更</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repair.steps.flatMap((step, si) =>
                      step.patches.map((patch, pi) => (
                        <tr key={`${si}-${pi}`}>
                          <td>{patch.operation}</td>
                          <td>
                            {patch.operation === "disconnect_nodes"
                              ? `删除连线 ${patch.source} → ${patch.target}`
                              : patch.operation === "connect_nodes"
                                ? `新增连线 ${patch.source} → ${patch.target}`
                                : [patch.node_id, patch.source, patch.target].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td>{patch.reason || step.reason || "—"}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
              {origin.run_id && session.run_id && origin.run_id !== session.run_id ? (
                <p className="caption">
                  <a href={`/report/runs/${origin.run_id}`}>原始 #{origin.run_id}</a>
                  {" → "}
                  <a href={`/report/runs/${session.run_id}`}>再验证 #{session.run_id}</a>
                </p>
              ) : null}
            </div></details>
          ) : null}
          <details className="vf-disclosure"><summary>核验矩阵</summary><div className="vf-disclosure-body">
            <div className="vf-table-wrap">
              <table className="vf-matrix">
                <thead>
                  <tr>
                    <th>需求</th>
                    {session.matrix.columns.map((col) => (
                      <th key={col}>{dimLabel(col)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {session.matrix.rows.map((row) => (
                    <tr key={row.constraint_id}>
                      <th scope="row">{row.requirement || row.constraint_id}</th>
                      {session.matrix.columns.map((col) => {
                        const cell = row.cells[col];
                        return (
                          <td key={col}>
                            <button
                              type="button"
                              className="vf-cell"
                              onClick={() => {
                                setMatrixCell(`${row.constraint_id}:${col}:${cell?.evidence || ""}:${cell?.algorithm_id || ""}`);
                                focusIssue(issues.find((issue) => issue.constraint_id === row.constraint_id) ?? null);
                              }}
                            >
                              {chip(cell?.status ?? "NOT_APPLICABLE")}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matrixCell ? <p className="caption">{matrixCell}</p> : null}
          </div></details>
          <details className="vf-disclosure"><summary>运行时对齐</summary><div className="vf-disclosure-body">
            <p className="caption">
              对齐代价 {session.alignment.alignment_cost} · 偏差 {session.alignment.deviation_count} · 编辑距离{" "}
              {session.alignment.sequential_edit_distance} · {session.alignment.limitations}
            </p>
            <div className="vf-table-wrap">
              <table className="vf-matrix">
                <thead>
                  <tr>
                    <th>预期</th>
                    <th>实际观测</th>
                    <th>对齐结果</th>
                  </tr>
                </thead>
                <tbody>
                  {session.alignment.alignment.map((row, index) => (
                    <tr key={`${row.kind}-${index}`}>
                      <td>{row.expected ?? "∅"}</td>
                      <td>{row.observed ?? "∅"}</td>
                      <td>{chip(row.kind)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div></details>
          <details className="vf-disclosure"><summary>近期核验记录</summary><div className="vf-disclosure-body">
            <div className="section-row">
              <Link className="btn btn-ghost btn-sm" href="/history">
                打开历史
              </Link>
            </div>
            <div className="vf-table-wrap">
              <table className="vf-matrix">
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>状态</th>
                    <th>问题数</th>
                    <th>运行时</th>
                    <th>门禁</th>
                    <th>耗时（毫秒）</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link href={`/report/runs/${run.id}`}>{run.id}</Link>
                      </td>
                      <td>{chip(run.status)}</td>
                      <td>{run.issue_count}</td>
                      <td>{run.runtime_status}</td>
                      <td>{run.gate_ready}</td>
                      <td>{Number(run.latency_ms).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.length >= 2 ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  try {
                    setCompare(await api.reportCompare(history[1].id, history[0].id));
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                比较最近两次验证
              </button>
            ) : null}
            {compare ? (
              <p className="caption">
                已解决 {compare.resolved.join(", ") || "—"} · 新增 {compare.new.join(", ") || "—"} · 未变化{" "}
                {compare.unchanged.join(", ") || "—"} · 门禁 {compare.left_gate} → {compare.right_gate}
              </p>
            ) : null}
          </div></details>
        </>
      ) : (
        <div className="vf-empty-workspace" aria-busy={initialLoading || Boolean(busy)}>
          <GitBranch size={32} />
          <h2>{busy ? "正在验证工作流" : initialLoading ? "正在读取验证记录" : error ? "暂时无法读取记录" : "从一条工作流开始"}</h2>
          <p>{initialLoading || busy ? "正在准备图、问题与证据。" : error ? "重试加载，或选择案例开始验证。" : "还没有验证记录。选择上方案例，运行后查看完整证据链。"}</p>
        </div>
      )}
    </div>
  );
}

export function AlgorithmTable({ items }: { items: AlgorithmRecord[] }) {
  return (
    <div className="vf-table-wrap">
      <table className="vf-matrix">
        <thead>
          <tr>
            <th>标识</th>
            <th>名称</th>
            <th>类别</th>
            <th>类型</th>
            <th>复杂度</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.algorithm_id}>
              <td>
                <Link href={`/algorithms/${item.algorithm_id}`}>{item.algorithm_id}</Link>
              </td>
              <td>{algorithmCopy(item.name)}</td>
              <td>{categoryLabel(item.category)}</td>
              <td>{item.deterministic ? "确定性" : "AI 辅助"}</td>
              <td>{algorithmCopy(item.complexity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
