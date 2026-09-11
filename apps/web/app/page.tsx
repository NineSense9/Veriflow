"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, ComposeSummary, ProblemListItem, SubmissionRow, unwrapBench } from "@/lib/api";
import StatusChip from "@/components/StatusChip";

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

function fmt(value: unknown, digits = 3) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
  }
  return "—";
}

export default function HomePage() {
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [runs, setRuns] = useState<HistRow[]>([]);
  const [projects, setProjects] = useState<ComposeSummary[]>([]);
  const [bench, setBench] = useState<Record<string, unknown> | null>(null);
  const [sandbox, setSandbox] = useState("…");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.health(),
      api.reportHistory(20),
      api.benchLatest(),
      api.composeList(),
      api.submissions(),
      api.problems(),
    ]).then((results) => {
      if (cancelled) return;
      const [health, history, latest, compose, submissions, problemList] = results;
      if (health.status === "fulfilled") setSandbox(health.value.sandbox);
      else setSandbox("down");
      if (history.status === "fulfilled") setRuns(history.value.runs);
      if (latest.status === "fulfilled") setBench(unwrapBench(latest.value));
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

  const latestRun = runs[0];
  const passRuns = runs.filter((row) => row.status === "PASS").length;
  const blocked = runs.filter((row) => row.gate_ready === "BLOCKED").length;
  const acCount = subs.filter((row) => row.verdict === "AC").length;
  const latestSub = subs[0];

  return (
    <Shell>
      <main className="page">
        <section className="reliability-overview">
          <header className="page-head split">
            <div>
              <p className="kicker">Reliability overview</p>
              <h1>模型提出候选，验证器给出证据</h1>
              <p className="lead">
                AI proposes. VeriFlow proves. Requirement → Spec → Workflow → Finding → Repair → Gate。判定权不在 LLM。
              </p>
              <p className="trace-motif" aria-hidden="true">
                <span />
                Propose
                <span />
                Verify
                <span />
                Evidence
                <span className="ok" />
                Repair
              </p>
            </div>
            <div className="page-head-actions">
              <Link className="btn btn-primary" href="/report?demo=case4_runtime">
                打开 Runtime FAIL
              </Link>
              <Link className="btn" href="/report?demo=case1_order">
                缺审题门
              </Link>
              <Link className="btn btn-ghost" href="/compose">
                需求编译
              </Link>
            </div>
          </header>
        </section>

        <dl className="metric-strip">
          <div>
            <dt>沙箱</dt>
            <dd>{sandbox}</dd>
          </div>
          <div>
            <dt>最近验证</dt>
            <dd>{latestRun ? chip(latestRun.status) : loaded ? "—" : "…"}</dd>
          </div>
          <div>
            <dt>最近 Gate</dt>
            <dd>{latestRun ? chip(latestRun.gate_ready) : "—"}</dd>
          </div>
          <div>
            <dt>最近记录 PASS</dt>
            <dd>
              {loaded ? passRuns : "—"}
              <span className="metric-den">/{runs.length || "—"}</span>
            </dd>
          </div>
          <div>
            <dt>Bench n</dt>
            <dd>{fmt(bench?.n, 0)}</dd>
          </div>
          <div>
            <dt>Detection F1</dt>
            <dd>{fmt(bench?.detection_f1)}</dd>
          </div>
        </dl>
        <p className="caption">
          PASS 比例只统计最近 {runs.length || 0} 条验证记录。Bench 来自 {String(bench?.source || "experiments/runs")}，合成 IR 故障，不是外部榜。
        </p>

        <div className="home-split">
          <section className="section">
            <div className="section-row">
              <h2 className="section-title">最近验证</h2>
              <Link className="btn btn-ghost btn-sm" href="/history">
                全部历史
              </Link>
            </div>
            {!loaded ? (
              <div aria-hidden="true">
                <div className="skel wide" />
                <div className="skel mid" />
                <div className="skel short" />
              </div>
            ) : !runs.length ? (
              <div className="empty">
                <p>还没有验证 run。打开黄金例或从出题页编译一张图。</p>
                <Link className="btn" href="/report?demo=case4_runtime">
                  跑一条 Demo
                </Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table tight">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Workflow</th>
                      <th>Status</th>
                      <th>Gate</th>
                      <th className="num">Issues</th>
                      <th className="num">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.slice(0, 8).map((row) => (
                      <tr key={row.id}>
                        <td className="num">
                          <Link href={`/report/runs/${row.id}`}>{row.id}</Link>
                        </td>
                        <td>{row.workflow_name || "—"}</td>
                        <td>{chip(row.status)}</td>
                        <td>{chip(row.gate_ready)}</td>
                        <td className="num">{row.issue_count}</td>
                        <td className="num">{Number(row.latency_ms).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {blocked ? <p className="caption">{blocked} 条最近记录 Gate 为 BLOCKED。</p> : null}
          </section>

          <aside className="home-aside">
            <section className="section">
              <h2 className="section-title">下一步</h2>
              <ul className="action-list">
                <li>
                  <Link href="/report">验证控制台</Link>
                  <span>黄金例：顺序 / 数据流 / 安全 / 运行时</span>
                </li>
                <li>
                  <Link href="/compose">需求编译</Link>
                  <span>{projects.length ? `${projects.length} 个草稿` : "从自然语言编译 IR"}</span>
                </li>
                <li>
                  <Link href="/benchmark">Benchmark</Link>
                  <span>
                    Repair {fmt(bench?.repair_success_rate)} · Loc {fmt(bench?.fault_localization_accuracy)}
                  </span>
                </li>
                <li>
                  <Link href="/algorithms">算法中心</Link>
                  <span>与 verifier 同一份注册表</span>
                </li>
              </ul>
            </section>
            {error ? <p className="ghost">{error}</p> : null}
          </aside>
        </div>

        <section className="section train-block">
          <h2 className="section-title">训练站（同一套沙箱）</h2>
          <p className="caption">对外仍是 ACM 训练测评。这里不替代验证，只说明选手侧还在。</p>
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
          {latestSub ? (
            <p className="latest-line">
              <span className={`verdict ${latestSub.verdict ?? ""}`}>{latestSub.verdict}</span>
              <Link href={`/problems/${latestSub.problem_id}`}>{latestSub.problem_id}</Link>
              <span className="ghost">
                {latestSub.lang} · {latestSub.time_ms ?? "—"} ms
              </span>
              <Link className="btn btn-ghost btn-sm" href="/problems/VF1001">
                选手题 VF1001
              </Link>
            </p>
          ) : loaded ? (
            <p className="caption">还没有提交。验证出题图之后，可以从题库写一发。</p>
          ) : null}
        </section>
      </main>
    </Shell>
  );
}
