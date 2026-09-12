"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, ComposeSummary, ProblemListItem, SubmissionRow } from "@/lib/api";
import StatusChip from "@/components/StatusChip";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import MagicBento from "@/components/reactbits/MagicBento";
import BrandAmbient from "@/components/BrandAmbient";
import styles from "./entry.module.css";

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

const CASES = [
  { id: "case1_order", name: "执行顺序", hint: "检查必要动作的先后关系", kind: "静态验证" },
  { id: "case2_dataflow", name: "数据流转", hint: "追踪参数绑定与数据依赖", kind: "静态验证" },
  { id: "case3_safety", name: "安全约束", hint: "发现工作流中的安全风险", kind: "静态验证" },
  { id: "case4_runtime", name: "运行时失败", hint: "静态通过后，运行仍可能失败", kind: "运行时模拟" },
];

export default function HomePage() {
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [runs, setRuns] = useState<HistRow[]>([]);
  const [projects, setProjects] = useState<ComposeSummary[]>([]);
  const [sandbox, setSandbox] = useState("…");
  const [ai, setAi] = useState<{ configured?: boolean; model?: string }>({});
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState(false);
  const [trainingLoaded, setTrainingLoaded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError("");
    setHistoryError(false);
    setTrainingLoaded(false);
    Promise.allSettled([
      api.health(), api.reportHistory(20), api.composeList(), api.submissions(), api.problems(),
    ]).then((results) => {
      if (cancelled) return;
      const [health, history, compose, submissions, problemList] = results;
      if (health.status === "fulfilled") {
        setSandbox(health.value.sandbox);
        setAi(health.value.ai || {});
      } else {
        setSandbox("down");
        setAi({});
      }
      if (history.status === "fulfilled") setRuns(history.value.runs);
      else setHistoryError(true);
      if (compose.status === "fulfilled") setProjects(compose.value.projects);
      if (submissions.status === "fulfilled") setSubs(submissions.value.submissions);
      if (problemList.status === "fulfilled") setProblems(problemList.value.problems);
      if (submissions.status === "fulfilled" && problemList.status === "fulfilled") setTrainingLoaded(true);
      else setError("训练记录暂时无法加载。");
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [reload]);

  const latestRun = runs[0];
  const latestAi = projects.find((project) => project.ai_trace?.requested && project.ai_trace.status !== "UNKNOWN")?.ai_trace;
  const acCount = subs.filter((row) => row.verdict === "AC").length;

  return (
    <Shell>
      <main className={`page ${styles.workbench}`}>
        <header className={styles.homeHeader}>
          <BrandAmbient variant="lines" className={styles.headingAmbient} />
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>VERIFLOW / 验证工作台</p>
            <h1>把生成的可能，变成可靠的结果。</h1>
            <p>编译需求、验证工作流，沿着证据定位每一个问题。</p>
          </div>
          <div className={styles.headerActions}>
            <Link className="btn btn-primary" href="/report?demo=case4_runtime">体验验证案例 <span aria-hidden="true">↗</span></Link>
            <Link className="btn" href="/compose">编译新需求</Link>
          </div>
        </header>

        <section className={styles.environment} aria-label="当前环境状态">
          <span className={styles.environmentLabel}>当前环境</span>
          <span><i className={styles.environmentDot} aria-hidden="true" />沙箱 <strong>{!loaded ? "检查中" : sandbox === "down" ? "不可用" : sandbox}</strong></span>
          <span>AI 编译 <strong>{!loaded ? "检查中" : ai.configured === undefined ? "状态未知" : ai.configured ? ai.model || "已配置" : "未配置"}</strong></span>
          {latestAi ? <span className={styles.aiActivity}>最近调用 <strong>{latestAi.status}</strong></span> : null}
          <Link href="/status">环境详情 <span aria-hidden="true">→</span></Link>
        </section>

        <MagicBento className={styles.bento} gridClassName={styles.workbenchGrid} enableSpotlight={false}>
          <SpotlightCard className={`magic-bento-card ${styles.panel} ${styles.latest}`}>
            <div className={styles.panelHeading}><h2>最近一次验证</h2><span className={styles.smallLabel}>已记录的运行</span></div>
            {!loaded ? <div className={styles.emptyState} role="status">正在读取验证记录…</div> : historyError ? (
              <div className={styles.emptyState}><p>验证记录暂时无法加载。</p><button className="btn btn-sm" onClick={() => setReload((value) => value + 1)}>重新加载</button></div>
            ) : latestRun ? (
              <>
                <div className={styles.runIdentity}><span>RUN / {String(latestRun.id).padStart(4, "0")}</span><h3>{latestRun.workflow_name || "未命名工作流"}</h3></div>
                <dl className={styles.verificationMetrics}>
                  <div><dt>验证结论</dt><dd><StatusChip value={latestRun.status} /></dd></div>
                  <div><dt>发现问题</dt><dd className={styles.issueCount}>{latestRun.issue_count}<span>项</span></dd></div>
                  <div><dt>发布门禁</dt><dd><StatusChip value={latestRun.gate_ready} /></dd></div>
                </dl>
                <div className={styles.runFoot}><span>运行时 <StatusChip value={latestRun.runtime_status} /><small>{latestRun.latency_ms.toFixed(1)} ms</small></span><Link className="btn btn-sm" href={`/report/runs/${latestRun.id}`}>查看证据 <span aria-hidden="true">→</span></Link></div>
              </>
            ) : (
              <div className={styles.emptyState}><span className={styles.emptyGlyph} aria-hidden="true">⌁</span><h3>你的第一份验证证据，从这里开始</h3><p>打开一个案例，查看工作流、问题与反例路径。</p><Link className="btn btn-sm" href="/report?demo=case4_runtime">体验验证案例 →</Link></div>
            )}
          </SpotlightCard>

          <section className={`magic-bento-card ${styles.panel} ${styles.cases}`} aria-labelledby="cases-title">
            <div className={styles.panelHeading}><h2 id="cases-title">四个案例，看懂验证</h2><span className={styles.smallLabel}>快速上手</span></div>
            <div className={styles.caseList}>
              {CASES.map((item, index) => (
                <Link key={item.id} href={`/report?demo=${item.id}`} className={styles.caseLink}>
                  <span className={styles.caseNumber}>0{index + 1}</span><span className={styles.caseCopy}><strong>{item.name}</strong><span>{item.hint}</span></span><span className={styles.caseKind}>{item.kind}</span><span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </section>

          <section className={`magic-bento-card ${styles.panel} ${styles.recent}`} aria-labelledby="recent-title">
            <div className={styles.panelHeading}><h2 id="recent-title">最近运行</h2><Link href="/history">全部记录 <span aria-hidden="true">→</span></Link></div>
            {!loaded ? <p className={styles.quietState} role="status">正在读取运行记录…</p> : historyError ? <p className={styles.quietState}>记录加载失败，请在上方重试。</p> : !runs.length ? <p className={styles.quietState}>还没有运行记录。完成验证后，结果会保存在这里。</p> : (
              <div className={styles.runList}>
                {runs.slice(0, 5).map((row) => (
                  <Link key={row.id} className={styles.runRow} href={`/report/runs/${row.id}`}><span className={styles.runId}>#{row.id}</span><strong>{row.workflow_name || "未命名工作流"}</strong><span className={styles.rowIssues}>{row.issue_count} 项问题</span><StatusChip value={row.status} /><span aria-hidden="true">→</span></Link>
                ))}
              </div>
            )}
          </section>
        </MagicBento>

        <section className={styles.training} aria-label="训练站">
          <div><h2>算法训练站</h2><p>用同一套沙箱练习、提交与评测。</p></div>
          {trainingLoaded ? <p className={styles.trainingStats}><span>题库 <strong>{problems.length}</strong></span><span>提交 <strong>{subs.length}</strong></span><span>通过 <strong>{acCount}</strong></span></p> : <p className={styles.trainingStats}>{loaded ? error : "正在读取训练记录…"}</p>}
          <Link className="btn btn-sm" href="/problems">进入训练站 <span aria-hidden="true">→</span></Link>
        </section>
      </main>
    </Shell>
  );
}
