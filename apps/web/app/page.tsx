"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, AIInvocationTrace, ComposeSummary, ProblemListItem, SubmissionRow } from "@/lib/api";
import StatusChip from "@/components/StatusChip";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import MagicBento from "@/components/reactbits/MagicBento";
import AnimatedList from "@/components/reactbits/AnimatedList";
import { DualPlane } from "@/components/AiRail";

type HistRow = {
  id: number;
  created_at: string;
  workflow_name: string;
  status: string;
  issue_count: number;
  runtime_status: string;
  gate_ready: string;
  latency_ms: number;
};

function chip(status: string) {
  return <StatusChip value={status} />;
}

function activityLine(trace: AIInvocationTrace | undefined, source: string) {
  if (!trace) return null;
  if (trace.status === "UNKNOWN") return null;
  if (!trace.requested && trace.status === "NOT_USED") return null;
  return `${source} · ${trace.stage} · ${trace.status}${trace.model ? ` · ${trace.model}` : ""}`;
}

export default function HomePage() {
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [runs, setRuns] = useState<HistRow[]>([]);
  const [projects, setProjects] = useState<ComposeSummary[]>([]);
  const [sandbox, setSandbox] = useState("…");
  const [ai, setAi] = useState<{ configured?: boolean; model?: string }>({});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.health(),
      api.reportHistory(20),
      api.composeList(),
      api.submissions(),
      api.problems(),
    ]).then((results) => {
      if (cancelled) return;
      const [health, history, compose, submissions, problemList] = results;
      if (health.status === "fulfilled") {
        setSandbox(health.value.sandbox);
        setAi(health.value.ai || {});
      } else setSandbox("down");
      if (history.status === "fulfilled") setRuns(history.value.runs);
      if (compose.status === "fulfilled") setProjects(compose.value.projects);
      if (submissions.status === "fulfilled") setSubs(submissions.value.submissions);
      else {
        const reason = submissions.reason as { status?: number };
        if (reason.status !== 401) setError("训练记录暂时读不到。");
      }
      if (problemList.status === "fulfilled") setProblems(problemList.value.problems);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const uniqueRuns = useMemo(() => {
    const seen = new Set<string>();
    const out: HistRow[] = [];
    for (const row of runs) {
      const key = row.workflow_name || String(row.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }, [runs]);
  const latestRun = uniqueRuns[0];
  const attention = uniqueRuns.find((row) => row.gate_ready === "BLOCKED" || row.status === "FAIL") || latestRun;
  const acCount = subs.filter((row) => row.verdict === "AC").length;
  const latestSub = subs[0];
  const aiLines = useMemo(() => {
    const lines: string[] = [];
    for (const project of projects) {
      const line = activityLine(project.ai_trace, `compose #${project.id}`);
      if (line) lines.push(line);
    }
    return lines.slice(0, 8);
  }, [projects]);

  return (
    <Shell>
      <main className="page page-home">
        <header className="page-head split">
          <div>
            <p className="kicker">Reliability workbench</p>
            <h1>模型提出候选，验证器给出证据</h1>
            <p className="lead">AI proposes. VeriFlow proves. 判定权不在 LLM。</p>
          </div>
          <div className="page-head-actions">
            <Link className="btn btn-primary" href="/report?demo=case4_runtime">
              打开 Runtime FAIL
            </Link>
            <Link className="btn" href="/compose">
              需求编译
            </Link>
          </div>
        </header>

        <DualPlane
          ai={{ model: ai.configured ? ai.model : undefined, configured: Boolean(ai.configured) }}
          proof={{ sandbox, gate: latestRun?.gate_ready, status: latestRun?.status }}
        />

        <MagicBento className="vf-workbench" disableAnimations={false}>
          <SpotlightCard className="magic-bento-card cell-latest">
            <p className="kicker">Latest Verification</p>
            {latestRun ? (
              <>
                <h2>
                  <Link href={`/report/runs/${latestRun.id}`}>#{latestRun.id}</Link> {latestRun.workflow_name}
                </h2>
                <p>
                  {chip(latestRun.status)} · Gate {chip(latestRun.gate_ready)} · issues {latestRun.issue_count}
                </p>
                <p className="caption">{latestRun.latency_ms.toFixed(1)} ms · recorded session</p>
              </>
            ) : (
              <p className="ghost">{loaded ? "还没有验证 run。" : "加载中…"}</p>
            )}
          </SpotlightCard>
          <article className="magic-bento-card cell-ai">
            <p className="kicker">AI Activity</p>
            {aiLines.length ? (
              <AnimatedList items={aiLines} showGradients={false} displayScrollbar={false} />
            ) : (
              <p className="ghost">暂无 AI 调用记录。配置不等于调用。</p>
            )}
          </article>
          <article className="magic-bento-card cell-proof">
            <p className="kicker">Proof Layer</p>
            <p>Sandbox {sandbox}</p>
            <p>Gate {latestRun ? chip(latestRun.gate_ready) : "—"}</p>
            <p>Run {latestRun ? chip(latestRun.status) : "—"}</p>
          </article>
          <article className="magic-bento-card cell-attention">
            <p className="kicker">Needs Attention</p>
            {attention ? (
              <>
                <p>
                  <Link href={`/report/runs/${attention.id}`}>#{attention.id}</Link> {attention.workflow_name}
                </p>
                <p>
                  {chip(attention.status)} · {chip(attention.gate_ready)}
                </p>
              </>
            ) : (
              <p className="ghost">没有 BLOCKED / FAIL 记录。</p>
            )}
          </article>
          <article className="magic-bento-card cell-runs">
            <p className="kicker">Recent Runs</p>
            {uniqueRuns.slice(0, 5).map((row) => (
              <p key={row.id} className="latest-line">
                <Link href={`/report/runs/${row.id}`}>#{row.id}</Link>
                <span>{row.workflow_name}</span>
                {chip(row.status)}
              </p>
            ))}
            {!uniqueRuns.length ? <p className="ghost">空</p> : null}
          </article>
          <article className="magic-bento-card cell-actions">
            <p className="kicker">Quick Actions</p>
            <div className="home-actions">
              <Link className="btn btn-sm" href="/report">
                验证
              </Link>
              <Link className="btn btn-sm" href="/compose">
                需求编译
              </Link>
              <Link className="btn btn-sm" href="/architecture">
                系统地图
              </Link>
              <Link className="btn btn-sm btn-ghost" href="/benchmark">
                评估详情
              </Link>
            </div>
          </article>
        </MagicBento>

        <section className="section train-block">
          <h2 className="section-title">训练站</h2>
          <p className="caption">同一套沙箱。这里不替代验证。</p>
          <dl className="metric-strip compact">
            <div>
              <dt>题库</dt>
              <dd>{problems.length || "—"}</dd>
            </div>
            <div>
              <dt>提交</dt>
              <dd>{subs.length}</dd>
            </div>
            <div>
              <dt>AC</dt>
              <dd>{acCount}</dd>
            </div>
            <div>
              <dt>最近判定</dt>
              <dd>{latestSub?.verdict ?? "—"}</dd>
            </div>
          </dl>
          {error ? <p className="ghost">{error}</p> : null}
        </section>
      </main>
    </Shell>
  );
}
