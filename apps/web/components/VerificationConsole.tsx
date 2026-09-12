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
import GridScan from "@/components/reactbits/GridScan";
import RuntimeReplay from "@/components/RuntimeReplay";
import { effectsAllowScan, useEffects } from "@/lib/effects";
import { setAmbientActivity } from "@/lib/ambient-activity";
import ComposeCanvas, { type GraphHandle } from "@/components/ComposeCanvas";
import { matchingIssueNodes } from "./verification-selection";
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
}: {
  initialDemo?: string;
  initialSession?: VerifySession | null;
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
  const [focused, setFocused] = useState("");
  const [scan, setScan] = useState(false);
  const [candidateId, setCandidateId] = useState("");
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

  function focusIssue(issue: VerifyIssue | null, nodeId?: string) {
    setSelected(issue);
    const ids = issue ? matchingIssueNodes(issue, session?.ir.nodes || []) : nodeId ? [nodeId] : [];
    setNodeNote(issue && !ids.length ? "当前问题没有匹配的工作流节点；请查看 Expected / Actual 和证据。" : "");
    setFocused(ids.length ? nodeId || ids[0] : "");
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
      setOrigin(next);
      setRepair(null);
    }
    setCompare(null);
    setNodeNote(firstIssue && !matchingIssueNodes(firstIssue, next.ir.nodes).length ? "当前问题没有匹配的工作流节点；请查看 Expected / Actual 和证据。" : "");
    setPipe(next.pipeline.find((step) => step.status !== "PASS")?.id ?? next.pipeline[0]?.id ?? null);
  }

  async function loadDemo(id: string) {
    setBusy(id);
    setDemoId(id);
    setError("");
    setScan(true);
    setAmbientActivity("executing");
    try {
      apply(await api.reportSession({ demo: id }));
      const hist = await api.reportHistory(20);
      setHistory(hist.runs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      setScan(false);
      setAmbientActivity("idle");
    }
  }

  useEffect(() => {
    api.demos().then((data) => setDemos(data.demos)).catch(() => undefined);
    if (initialSession) {
      apply(initialSession);
      api.reportHistory(20).then((hist) => setHistory(hist.runs)).catch(() => undefined);
      return;
    }
    loadDemo(initialDemo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDemo, initialSession]);

  const highlight = useMemo(() => {
    if (!selected) return undefined;
    const mini = session?.minimized.find((item) => item.issue_id === selected.id);
    return {
      nodes: selected.minimized_nodes?.length ? selected.minimized_nodes : selected.affected_nodes,
      path: mini?.witness_path.length ? mini.witness_path : selected.witness_path,
    };
  }, [selected, session]);

  const ir: WorkflowIR | null = session?.ir ?? null;
  const issues: VerifyIssue[] = [
    ...(session?.static.issues ?? []),
    ...((session?.runtime_findings ?? []) as VerifyIssue[]),
  ];
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

  return (
    <div className="vf-console vf-workbench-console">
      <div className="vf-toolbar vf-session-actions">
        <label className="vf-case-select">
          <span>核验案例</span>
          <select value={demoId} disabled={Boolean(busy)} onChange={(event) => loadDemo(event.target.value)}>
            {!demos.length ? <option value={demoId}>{demoId}</option> : null}
            {demos.map((demo) => <option key={demo.id} value={demo.id}>{demo.title}</option>)}
          </select>
        </label>
        {session ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={Boolean(busy)}
            onClick={async () => {
              try {
                const pack = await api.reportExport({ demo: demoId });
                const blob = new Blob([pack.markdown], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "veriflow-evidence.md";
                link.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            导出证据
          </button>
        ) : null}
        {session && issues.length ? (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={Boolean(busy)}
            onClick={async () => {
              setError("");
              setBusy("repair");
              setScan(true);
              setAmbientActivity("executing");
              try {
                const report = await api.verifyRepair(session.ir, nl, prefs.aiRepair);
                const next = await api.reportSession({
                  ir: report.ir,
                  nl,
                  parent_run_id: session.run_id,
                });
                apply(next, { keepOrigin: true });
                setRepair(report);
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
            {busy === "repair" ? "修复中…" : "受约束修复"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {session ? (
        <>
          {session.parent_run_id ? (
            <p className="caption">
              本 run 是 Re-Verify，原始记录{" "}
              <Link href={`/report/runs/${session.parent_run_id}`}>#{session.parent_run_id}</Link>
            </p>
          ) : null}
          <section className="vf-verdict" aria-label="最终核验结论">
            <div className="vf-verdict-heading">
              <div><span className="kicker">FINAL VERDICT{session.run_id ? ` · RUN #${session.run_id}` : ""}</span><h2>{session.ir.name}</h2></div>
              <div className="vf-verdict-chips"><span>核验 {chip(session.status)}</span><span>发布门禁 {chip(session.gate.ready)}</span></div>
            </div>
            <p className="caption">{gateWhy(dimensions.find((item) => item.name === "executable")?.status, session.runtime?.status, session.gate.ready) || "核验结果来自静态验证器与运行时记录。"}</p>
            <dl className="vf-strip">
            <div>
              <dt>Constraints</dt>
              <dd>
                {session.static.constraints_passed ?? session.static.requirements_passed}/
                {session.static.constraints?.length ?? session.static.requirements_total}
              </dd>
            </div>
            <div>
              <dt>Issues</dt>
              <dd>{issues.length}</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>{chip(session.runtime?.status ?? "NOT_RUN")}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{session.latency_ms.toFixed(1)} ms</dd>
            </div>
          </dl>
          </section>
          <Stepper
            labels={session.pipeline.map((step) => step.name)}
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
                  <strong>{step.name}</strong> · {step.output_summary || "查看本步骤的核验记录"}
                </p>
                <p className="caption">
                  {step.kind} · {step.algorithm_id} · {step.latency_ms.toFixed(1)}ms · cache {step.cache_status} · checks {step.checks_executed}
                  {step.output_summary ? ` · ${step.output_summary}` : ""}
                </p>
              </Step>
            ))}
          </Stepper>
          <div className="vf-12">
            <section className="vf-viz">
              <div className="vf-toolbar vf-graph-toolbar">
                <h2>工作流 DAG</h2>
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
                  disabled={graphMode !== "workflow"}
                  onClick={() => {
                    graphRef.current?.fitAll();
                    setFocused("");
                  }}
                >
                  适应画布
                </button>
                {focused ? <span className="caption">Focused: {focused}</span> : null}
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
                    onSelectNode={(id) => {
                      const hit = issues.find(
                        (item) => item.affected_nodes?.includes(id) || item.minimized_nodes?.includes(id),
                      );
                      setNodeNote(hit ? "" : `节点 ${id} 没有 finding。`);
                      if (hit) {
                        focusIssue(hit, id);
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
                  <div className="vf-dag-frame" style={{ height: 318, minHeight: 318 }}>
                    <EvidenceGraphView
                      entities={session.graph.entities}
                      relations={session.graph.relations}
                      focusId={
                        session.graph.entities.find(
                          (item) =>
                            selected && item.type === "Issue" && (item.label === selected.code || item.id.endsWith(selected.id)),
                        )?.id
                      }
                    />
                  </div>
                ) : null}
              </div>
            </section>
            <aside className="vf-findings">
              <div className="vf-issues-heading"><h2>问题定位</h2><span className="vf-count">{issues.length}</span></div>
              <p className="caption">
                Total {issues.length} · Static {session.static.issues.length} · Runtime {(session.runtime_findings ?? []).length}
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
                <div className="vf-current-issue" aria-label="当前问题证据">
                  <dl className="vf-kv vf-primary-evidence">
                    <div><dt>Reason</dt><dd>{selected.title || selected.description || selected.code}</dd></div>
                    <div><dt>Expected</dt><dd>{selected.expected ?? "未提供预期值"}</dd></div>
                    <div><dt>Actual</dt><dd>{selected.actual ?? "未提供实际值"}</dd></div>
                    <div><dt>Witness</dt><dd className="mono">{(highlight?.path ?? selected.witness_path ?? []).join(" → ") || "无已记录见证路径"}</dd></div>
                  </dl>
                  <details className="vf-evidence-details"><summary>查看根因与完整证据</summary><dl className="vf-kv">
                    <div><dt>Root cause</dt><dd>{root?.summary ?? selected.root_cause_id ?? "—"}</dd></div>
                  <div>
                    <dt>Minimal counterexample</dt>
                    <dd>
                      {mini
                        ? `nodes ${mini.minimized_nodes.join(", ") || "—"} · path ${(mini.witness_path || []).join(" → ") || "—"} · globally_minimal ${String(mini.globally_minimal)}`
                        : "counterexample.minimize 仅对静态 Issue 运行"}
                    </dd>
                  </div>
                  <div>
                    <dt>Minimized</dt>
                    <dd>{(selected.minimized_nodes ?? []).join(", ") || "—"}</dd>
                  </div>
                  <div>
                    <dt>Detected by</dt>
                    <dd>
                      <Link href={`/algorithms/${selected.detected_by || "graph.integrity"}`}>
                        {selected.detected_by || "—"} v{selected.algorithm_version || "—"}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>{selected.verification_method ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>{selected.evidence_source ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Suggestion</dt>
                    <dd>{selected.repair_hint ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Why?</dt>
                    <dd>
                      {graphNb.map((ent) => (
                        <span key={ent.id} className="caption">
                          {ent.type}:{ent.label}{" "}
                        </span>
                      ))}
                    </dd>
                  </div>
                  </dl></details>
                </div>
              ) : null}
              {session.ambiguity && session.ambiguity.status !== "CLEAR" ? (
                <p className="caption">
                  Requirement {session.ambiguity.status} ({session.ambiguity.method})
                  {session.ambiguity.items[0] ? ` · ${session.ambiguity.items[0].reason}` : ""}
                </p>
              ) : null}
            </aside>
          </div>
          <details className="vf-disclosure"><summary>需求与编译依据 <span>Requirement / Spec</span></summary><div className="vf-disclosure-body">
          <section className="vf-req">
            <div>
              <h2>Requirement</h2>
              <p>
                {selectedTrace?.start != null && selectedTrace.end != null ? (
                  <>
                    {nl.slice(0, selectedTrace.start)}
                    <mark>{nl.slice(selectedTrace.start, selectedTrace.end)}</mark>
                    {nl.slice(selectedTrace.end)}
                  </>
                ) : (
                  nl || "（本次 session 未带自然语言需求）"
                )}
              </p>
            </div>
            <dl className="vf-kv compact">
              <div>
                <dt>Intent / Spec</dt>
                <dd>{goal || "—"}</dd>
              </div>
              <div>
                <dt>Compiler</dt>
                <dd>
                  {String((session.spec as { compiler?: string }).compiler || "—")}
                  {specBasis ? ` · ${specBasis}` : ""}
                </dd>
              </div>
              <div>
                <dt>Workflow</dt>
                <dd>
                  {session.ir.name} · {session.ir.nodes.length} nodes · {session.ir.edges.length} edges
                </dd>
              </div>
            </dl>
          </section>

          <p className="caption">
            {session.cross.pattern} · {session.cross.story} · hash {session.workflow_hash}
            {session.node_coverage.unknown.length ? ` · unknown nodes ${session.node_coverage.unknown.length}` : ""}
          </p>
          </div></details>
          {trace ? (
            <details className="vf-disclosure"><summary>需求覆盖 <span>Requirement Coverage</span></summary><div className="vf-disclosure-body">
              <p className="caption">
                COVERED {trace.covered} · FAILED {trace.failed} · AMBIGUOUS {trace.ambiguous} · UNMAPPED {trace.unmapped}
                。覆盖来自 spec 约束与 verifier，不是 LLM 自评。
              </p>
              <div className="vf-table-wrap">
                <table className="vf-matrix">
                  <thead>
                    <tr>
                      <th>Clause</th>
                      <th>Status</th>
                      <th>Nodes</th>
                      <th>Verifier</th>
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
                              if (!hit) setNodeNote(row.nodes.length ? `clause ${row.id} → ${row.nodes.join(", ")}` : row.text);
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
              ) || "每维是独立判定，不是加权总分。「静态可达」看图结构，「运行时模拟」看 Mock trace。"}
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
          {session.trace?.events?.length ? (
            <details className="vf-disclosure"><summary>已记录的运行回放 <span>{session.trace.events.length} events · 非重新执行</span></summary><div className="vf-disclosure-body"><RuntimeReplay events={session.trace.events} play={false} /></div></details>
          ) : null}
          {repair && origin ? (
            <details className="vf-disclosure vf-repair"><summary>受约束修复记录 <span>Repair → Guard → Re-Verify</span></summary><div className="vf-disclosure-body">
              <p className="vf-repair-decision"><strong>最终决策：{repair.final_decision || "—"}</strong> · {chip(repair.final.status)}</p>
              <p className="caption">
                Problem / Proposal / Guard playback / Outcome. selected_candidate_id 与 final_decision 分离。source 来自 API，不在前端猜。
                {origin.run_id ? ` Before #${origin.run_id}` : ""}
                {session.run_id ? ` · After #${session.run_id}` : ""}.
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
                  {ev.accepted ? " · accepted" : ` · ${ev.reject_reason || "rejected"}`}
                </p>
              ))}
              <p className="caption">
                decision {repair.final_decision || "—"} · selected {repair.selected_candidate_id || "—"}
              </p>
              <p className="caption">
                Guard rejected {repair.candidates_rejected_guard ?? 0} · Incremental rejected{" "}
                {repair.candidates_rejected_incremental ?? 0} · Fully verified {repair.candidates_fully_verified ?? 0}
                {repair.used_full_fallback ? " · fallback Full Verification" : " · incremental subset"}
                {repair.affected_verifiers?.length ? ` · re-run ${repair.affected_verifiers.join(", ")}` : ""}
                {repair.impact_reason ? ` · ${repair.impact_reason}` : ""}
              </p>
              <div className="vf-ba">
                <article>
                  <h3>Before</h3>
                  <p>Run {chip(origin.status)}</p>
                  <p>Gate {chip(origin.gate.ready)}</p>
                  <p>运行时 {chip(origin.runtime?.status ?? "NOT_RUN")}</p>
                  <p className="caption">
                    Issues {(origin.static.issues.length || 0) + (origin.runtime_findings?.length || 0)}
                  </p>
                </article>
                <article>
                  <h3>After</h3>
                  <p>Run {chip(session.status)}</p>
                  <p>Gate {chip(session.gate.ready)}</p>
                  <p>运行时 {chip(session.runtime?.status ?? "NOT_RUN")}</p>
                  <p className="caption">Issues {issues.length}</p>
                </article>
                <article>
                  <h3>Delta</h3>
                  <p className="caption">
                    Static {repair.initial?.status || "—"} → {repair.final.status} ·{" "}
                    {repair.improved ? "improved" : "not improved"}
                  </p>
                  <p className="caption">
                    Resolved{" "}
                    {Math.max(
                      0,
                      (origin.static.issues.length || 0) +
                        (origin.runtime_findings?.length || 0) -
                        issues.length,
                    )}{" "}
                    · Remaining {issues.length}
                  </p>
                </article>
              </div>
              <div className="vf-table-wrap">
                <table className="vf-matrix">
                  <thead>
                    <tr>
                      <th>Patch</th>
                      <th>Change</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repair.steps.flatMap((step, si) =>
                      step.patches.map((patch, pi) => (
                        <tr key={`${si}-${pi}`}>
                          <td>{patch.operation}</td>
                          <td>
                            {patch.operation === "disconnect_nodes"
                              ? `Removed edge ${patch.source} → ${patch.target}`
                              : patch.operation === "connect_nodes"
                                ? `Added edge ${patch.source} → ${patch.target}`
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
                  <a href={`/report/runs/${origin.run_id}`}>Original #{origin.run_id}</a>
                  {" → "}
                  <a href={`/report/runs/${session.run_id}`}>Re-verified #{session.run_id}</a>
                </p>
              ) : null}
            </div></details>
          ) : null}
          <details className="vf-disclosure"><summary>核验矩阵 <span>Verification Matrix</span></summary><div className="vf-disclosure-body">
            <div className="vf-table-wrap">
              <table className="vf-matrix">
                <thead>
                  <tr>
                    <th>Requirement</th>
                    {session.matrix.columns.map((col) => (
                      <th key={col}>{col}</th>
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
          <details className="vf-disclosure"><summary>运行时对齐 <span>Runtime Alignment</span></summary><div className="vf-disclosure-body">
            <p className="caption">
              cost {session.alignment.alignment_cost} · deviations {session.alignment.deviation_count} · DP edit{" "}
              {session.alignment.sequential_edit_distance} · {session.alignment.limitations}
            </p>
            <div className="vf-table-wrap">
              <table className="vf-matrix">
                <thead>
                  <tr>
                    <th>Expected</th>
                    <th>Observed</th>
                    <th>Align</th>
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
          <details className="vf-disclosure"><summary>近期核验记录 <span>Recent runs</span></summary><div className="vf-disclosure-body">
            <div className="section-row">
              <Link className="btn btn-ghost btn-sm" href="/history">
                打开历史
              </Link>
            </div>
            <div className="vf-table-wrap">
              <table className="vf-matrix">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>status</th>
                    <th>issues</th>
                    <th>runtime</th>
                    <th>gate</th>
                    <th>ms</th>
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
                Compare last two
              </button>
            ) : null}
            {compare ? (
              <p className="caption">
                resolved {compare.resolved.join(", ") || "—"} · new {compare.new.join(", ") || "—"} · unchanged{" "}
                {compare.unchanged.join(", ") || "—"} · gate {compare.left_gate} → {compare.right_gate}
              </p>
            ) : null}
          </div></details>
        </>
      ) : (
        <div aria-busy="true">
          <div className="skel wide" />
          <div className="skel mid" />
          <p className="ghost">{busy ? "验证中…" : "加载 Demo"}</p>
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
            <th>ID</th>
            <th>Name</th>
            <th>Category</th>
            <th>Kind</th>
            <th>Complexity</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.algorithm_id}>
              <td>
                <Link href={`/algorithms/${item.algorithm_id}`}>{item.algorithm_id}</Link>
              </td>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td>{item.deterministic ? "Deterministic" : "AI-assisted"}</td>
              <td>{item.complexity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
