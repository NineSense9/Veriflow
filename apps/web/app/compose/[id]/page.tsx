"use client";

import { statusLabel, categoryLabel } from "@/lib/ui-zh";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { api, ComposeProject, VerifyIssue } from "@/lib/api";
import { useEffects } from "@/lib/effects";
import WitnessMotion from "@/components/WitnessMotion";
import RuntimeReplay from "@/components/RuntimeReplay";
import ComposeStoryDesk from "@/components/ComposeStoryDesk";
import ProblemPackagePanel from "@/components/ProblemPackagePanel";

const ComposeCanvas = dynamic(() => import("@/components/ComposeCanvas"), { ssr: false });

function ComposeProjectBody() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const story = search.get("story") === "1";
  const id = Number(params.id);
  const [project, setProject] = useState<ComposeProject | null>(null);
  const [nl, setNl] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<VerifyIssue | null>(null);
  const [skipAfter, setSkipAfter] = useState("");
  const [runtimeOverlay, setRuntimeOverlay] = useState<ComposeProject["runtime"]>();
  const [traceOverlay, setTraceOverlay] = useState<ComposeProject["trace"]>();
  const [crossOverlay, setCrossOverlay] = useState<ComposeProject["cross"]>();
  const { prefs } = useEffects();

  function apply(next: ComposeProject) {
    setProject(next);
    setNl(next.source_nl);
    setSelected(next.verification?.issues[0] ?? null);
    setRuntimeOverlay(undefined);
    setTraceOverlay(undefined);
    setCrossOverlay(undefined);
  }

  useEffect(() => {
    api.composeGet(id).then(apply).catch(() => setMessage("项目加载失败"));
  }, [id]);

  async function run(label: string, work: () => Promise<ComposeProject>) {
    setBusy(label);
    setMessage("");
    try {
      apply(await work());
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  const highlight = useMemo(() => {
    if (!selected) return undefined;
    return { nodes: selected.affected_nodes, path: selected.witness_path };
  }, [selected]);

  if (!project) {
    return <div className="page">{message ? <p className="err" role="alert">{message} <button type="button" onClick={() => { setMessage(""); api.composeGet(id).then(apply).catch(() => setMessage("项目加载失败")); }}>重试</button></p> : <p className="ghost">画布展开中…</p>}</div>;
  }

  if (story) {
    return <><ComposeStoryDesk project={project} onProject={apply} /><div className="page"><ProblemPackagePanel project={project} onProject={apply} /></div></>;
  }

  const verification = project.verification;
  const status = verification?.status ?? (project.errors.length ? "FAIL" : "PASS");

  return (
      <div className="compose-desk">
        <div className="arena-top">
          <Link href="/compose" className="btn btn-ghost btn-sm">
            返回草稿
          </Link>
          <span className="pid">#{project.id}</span>
          <h1>验证工坊</h1>
          <span className={`verdict ${status === "PASS" ? "AC" : status === "WARNING" ? "TLE" : "WA"}`}>
            {statusLabel(status)}
          </span>
          <span
            className={`verdict ${
              project.gate?.ready === "READY" ? "AC" : project.gate?.ready === "REVIEW REQUIRED" ? "TLE" : "WA"
            }`}
          >
            {statusLabel(project.gate?.ready)}
          </span>
          <span className="ghost">{verification ? `风险：${statusLabel(verification.risk_level)}` : project.compiler}</span>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run("repair", () => api.composeRepair(id, nl, prefs.aiInterpret))}
          >
            再编译
          </button>
          <button
            type="button"
            className="primary"
            disabled={Boolean(busy)}
            data-click-fx="strong"
            onClick={() => run("verify-repair", () => api.composeVerifyRepair(id, prefs.aiRepair))}
          >
            {busy === "verify-repair" ? "修复中" : "受约束修复"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || project.errors.length > 0 || !project.problem_package?.ready || Boolean(project.published_problem_id)}
            onClick={() => run("gate", () => api.composeGate(id, "approved"))}
          >
            审题通过
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={Boolean(busy)}
            onClick={() => run("gate", () => api.composeGate(id, "rejected"))}
          >
            驳回
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run("publish", () => api.composePublish(id))}
          >
            入库
          </button>
        </div>
        <ProblemPackagePanel project={project} onProject={apply} />
        <div className="compose-req">
          <label htmlFor="compose-nl-edit">出题要求</label>
          <textarea
            id="compose-nl-edit"
            className="compose-nl tight"
            rows={2}
            value={nl}
            onChange={(e) => setNl(e.target.value)}
          />
        </div>
        <section className="compose-canvas">
            {project.ir ? (
              <ComposeCanvas
                ir={project.ir}
                errors={project.errors}
                highlight={highlight}
                failing={(verification?.issues ?? []).flatMap((item) => item.affected_nodes || [])}
                onSelectNode={(id) => {
                  const hit = (verification?.issues ?? []).find((item) => item.affected_nodes?.includes(id));
                  setSelected(hit ?? null);
                  if (!hit) setMessage(`节点 ${id} 没有关联问题。`);
                }}
              />
            ) : (
              <p className="ghost" style={{ padding: 16 }}>
                还没有生成出题流程。
              </p>
            )}
        </section>
        <div className="compose-boards">
          <section className="compose-board">
            <h2>检查</h2>
            <p className="caption">
              {busy
                ? prefs.aiInterpret
                  ? "正在请求 AI 工作流提案"
                  : "正在使用启发式规则编译（未调用 AI）"
                : project.ai_trace
                  ? `${statusLabel(project.ai_trace.status)}${project.ai_trace.fallback_reason ? ` · ${project.ai_trace.fallback_reason}` : ""}`
                  : "来源未知 · 历史记录未保存提案来源"}
            </p>
            <dl className="vf-kv compact">
              <div>
                <dt>自然语言 → 工作流</dt>
                <dd>工作流提案 · {project.compiler || "—"}</dd>
              </div>
              <div>
                <dt>规格</dt>
                <dd>确定性规格编译器</dd>
              </div>
              <div>
                <dt>中间表示</dt>
                <dd>
                  {project.ir ? `${project.ir.name} · ${project.ir.nodes.length} 个节点 · ${project.ir.edges.length} 条边` : "—"}
                </dd>
              </div>
            </dl>
            {project.ai_trace?.status === "UNKNOWN" ? (
              <p className="caption">历史记录未保存提案来源，不能据此判断是否使用过 AI。</p>
            ) : null}
            <p className="caption">
              {verification
                ? `${verification.constraints_passed ?? verification.requirements_passed} PASS · ${verification.constraints_failed ?? 0} FAIL · ${verification.constraints_unknown ?? 0} UNKNOWN`
                : "尚未验证"}
            </p>
            {(verification?.constraints ?? []).map((item) => (
              <button
                type="button"
                key={item.constraint_id}
                className={`sample ${item.status === "FAIL" ? "fail" : ""}`}
                onClick={() =>
                  setSelected({
                    id: item.constraint_id,
                    category: item.constraint_type,
                    severity: item.status === "FAIL" ? "HIGH" : "LOW",
                    code: item.constraint_id,
                    title: item.constraint_type,
                    description: item.description || item.constraint_id,
                    affected_nodes: item.affected_nodes ?? [],
                    witness_path: item.witness_path ?? [],
                    expected: item.expected,
                    actual: item.actual,
                  })
                }
              >
                <span className={`verdict ${item.status === "PASS" ? "AC" : item.status === "UNKNOWN" ? "TLE" : "WA"}`}>
                  {statusLabel(item.status)}
                </span>
                <div>
                  {categoryLabel(item.constraint_type)} · {item.verification_method}
                </div>
              </button>
            ))}
            {verification?.dimensions.map((item) => (
              <div key={item.name} className="latest-line">
                <span className={`verdict ${item.status === "PASS" ? "AC" : item.status === "WARNING" || item.status === "UNKNOWN" ? "TLE" : "WA"}`}>
                  {statusLabel(item.status)}
                </span>
                <span>{item.name === "executable" ? "静态可达" : item.name === "runtime" ? "运行时模拟" : categoryLabel(item.name)}</span>
                <span className="ghost">{item.issue_count}</span>
              </div>
            ))}
            <h2>问题列表</h2>
            {verification?.issues.length ? (
              verification.issues.map((issue) => (
                <button
                  type="button"
                  key={issue.id}
                  className={`sample ${selected?.id === issue.id ? "fail" : ""}`}
                  onClick={() => setSelected(issue)}
                >
                  <span className={`verdict ${issue.severity === "CRITICAL" || issue.severity === "HIGH" ? "WA" : "TLE"}`}>
                    {issue.code}
                  </span>
                  <div>{issue.title}</div>
                </button>
              ))
            ) : (
              <p className="ghost">没有发现问题。</p>
            )}
            {selected ? (
              <>
                <h2>当前问题详情</h2>
                <p className="note">{selected.description}</p>
                <p className="caption">预期：{selected.expected ?? "—"}</p>
                <p className="caption">实际：{selected.actual ?? "—"}</p>
                {selected.witness_path.length ? (
                  <>
                    <p className="caption">反例路径：{selected.witness_path.join(" → ")}</p>
                    <WitnessMotion path={selected.witness_path} play={!busy} />
                  </>
                ) : null}
                {selected.repair_hint ? <p className="caption">{selected.repair_hint}</p> : null}
              </>
            ) : null}
          </section>
          <section className="compose-board">
            <h2>运行</h2>
            {(traceOverlay || project.trace)?.events?.length ? (
              <RuntimeReplay events={(traceOverlay || project.trace)!.events} play={Boolean(traceOverlay)} />
            ) : null}
            <p className="caption">
              {(crossOverlay ?? project.cross)?.pattern ?? "未运行"} · 覆盖率{" "}
              {(runtimeOverlay ?? project.runtime)?.constraint_runtime_coverage != null
                ? `${Math.round(((runtimeOverlay ?? project.runtime)?.constraint_runtime_coverage ?? 0) * 100)}%`
                : "—"}
            </p>
            <p className="caption">{(crossOverlay ?? project.cross)?.story}</p>
            {project.ir ? (
              <label className="caption">
                截断运行时
                <select value={skipAfter} onChange={(event) => setSkipAfter(event.target.value)}>
                  <option value="">完整工作流</option>
                  {project.ir.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    setBusy("runtime");
                    setMessage("");
                    try {
                      const payload = await api.runtime(project.ir!, nl, skipAfter || undefined);
                      setTraceOverlay(payload.trace);
                      setRuntimeOverlay(payload.runtime);
                      setCrossOverlay(payload.cross);
                    } catch (err) {
                      setMessage((err as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  模拟
                </button>
              </label>
            ) : null}
            {(traceOverlay ?? project.trace)?.events.map((event, index, events) => (
              <div key={event.event_index} className="caption">
                #{event.event_index} {event.operation}
                {event.branch ? ` ${event.branch.toUpperCase()}` : ""} {event.status}
                {event.external_effect ? ` · ${event.external_effect}` : ""}
                {events[index + 1] ? ` ↓ ${event.duration_ms}ms` : ` · ${event.duration_ms}ms`}
              </div>
            ))}
            {(runtimeOverlay ?? project.runtime)?.issues
              ?.filter((item) => item.status === "FAIL")
              .map((item) => (
                <button
                  type="button"
                  className="sample fail"
                  key={item.constraint_id}
                  onClick={() =>
                    setSelected({
                      id: item.constraint_id,
                      category: "runtime",
                      severity: "HIGH",
                      code: item.constraint_id,
                      title: item.expected,
                      description: item.observed,
                      affected_nodes: item.affected_nodes ?? [],
                      witness_path: (traceOverlay ?? project.trace)?.events
                        .filter((event) => item.trace_slice?.includes(event.event_index))
                        .map((event) => event.node_id) ?? [],
                      expected: item.expected,
                      actual: item.observed,
                    })
                  }
                >
                  <span className="verdict WA">{item.constraint_id}</span>
                  <div>
                    {(item.counterexample?.slice_labels ?? []).join(" → ") || item.observed}
                  </div>
                </button>
              ))}
          </section>
          <section className="compose-board">
            <h2>修复</h2>
            {project.repair ? (
              <>
                <h2>修复过程</h2>
                <ol className="caption">
                  <li>已编译规格</li>
                  <li>
                    {project.repair.initial.constraints_passed ?? project.repair.initial.requirements_passed}/
                    {project.repair.initial.constraints?.length ?? project.repair.initial.requirements_total} 项约束
                  </li>
                  {project.repair.steps.map((step) => (
                    <li key={step.iteration}>
                      第 {step.iteration} 轮： {step.reason}
                      {step.candidates_evaluated ? ` · ${step.candidates_evaluated} 个候选` : ""}
                    </li>
                  ))}
                  <li>
                    再验证 {project.repair.final.status}
                  </li>
                </ol>
                <h2>修复结果</h2>
                <p className="caption">
                  {project.repair.initial.status} → {project.repair.final.status} · 补丁操作数 {project.repair.patch_operations ?? "—"} · 改动节点数 {project.repair.changed_nodes ?? "—"}
                </p>
                {project.repair.steps.flatMap((step) =>
                  step.patches.map((patch, index) => (
                    <p className="caption" key={`${step.iteration}-${index}`}>
                      {patch.operation}
                      {patch.source && patch.target ? ` ${patch.source} → ${patch.target}` : ""}
                      {patch.reason ? ` · ${patch.reason}` : ""}
                    </p>
                  )),
                )}
              </>
            ) : (
              <p className="ghost">还没有修过。点「受约束修复」才会留下对比。</p>
            )}
            <h2>改动</h2>
            {project.repair ? (
              <>
                <p className="caption">
                  改动节点： {(project.repair.impact_nodes ?? []).join(", ") || project.repair.changed_nodes}
                </p>
                <p className="caption">
                  重新检查： {project.repair.reevaluated_constraints ?? "—"} / {project.repair.total_constraints ?? "—"}{" "}
                  项约束
                  {project.repair.used_full_fallback ? " · 回退完整验证" : " · 增量验证"}
                </p>
                <p className="caption">
                  候选数 {project.repair.candidates_generated ?? 0} · 守卫拒绝{" "}
                  {project.repair.candidates_rejected_guard ?? 0} · 增量检查拒绝{" "}
                  {project.repair.candidates_rejected_incremental ?? 0} · 完整验证通过{" "}
                  {project.repair.candidates_fully_verified ?? 0}
                </p>
                <p className="caption">最终完整验证： {project.repair.final.status}</p>
              </>
            ) : (
              <p className="ghost">暂无补丁，完成一轮修复后可查看对比。</p>
            )}
          </section>
          <section className="compose-board">
            <h2>审题 / 入库</h2>
            <p>
              <span
                className={`verdict ${
                  project.gate?.ready === "READY" ? "AC" : project.gate?.ready === "REVIEW REQUIRED" ? "TLE" : "WA"
                }`}
              >
                {statusLabel(project.gate?.ready)}
              </span>
              <span className="ghost">
                {" "}
                {project.gate_status}
                {project.published_problem_id ? ` · 已入库 ${project.published_problem_id}` : ""}
              </span>
            </p>
            {Object.entries(project.gate?.dimensions ?? {}).map(([name, status]) => (
              <div key={name} className="latest-line">
                <span className={`verdict ${status === "PASS" || status === "READY" ? "AC" : status === "WARNING" || status === "UNKNOWN" ? "TLE" : "WA"}`}>
                  {statusLabel(status)}
                </span>
                <span>{categoryLabel(name)}</span>
              </div>
            ))}
            {(project.gate?.reasons ?? []).map((reason) => (
              <p className="caption" key={reason}>
                {reason}
              </p>
            ))}
            <h2>弱测资</h2>
            {project.attack.length === 0 ? (
              <p className="ghost">没有明显弱数据。</p>
            ) : (
              project.attack.map((item, index) => (
                <div className="sample" key={`${item.tag}-${index}`}>
                  <span className="verdict WA">{item.tag}</span>
                  <div>{item.message}</div>
                </div>
              ))
            )}
            {message ? <p className="err" role="alert">{message}</p> : null}
            {busy ? <p className="ghost">正在处理…</p> : null}
          </section>
        </div>
      </div>
  );
}

export default function ComposeProjectPage() {
  return (
    <Shell>
      <Suspense fallback={<p className="page ghost">画布展开中…</p>}>
        <ComposeProjectBody />
      </Suspense>
    </Shell>
  );
}
