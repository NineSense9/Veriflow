"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { Me, ProblemListItem, SubmissionRow, api } from "@/lib/api";

const ROLE_ZH: Record<string, string> = {
  contestant: "选手",
  setter: "出题",
  admin: "管理员",
};

const VERDICTS = ["AC", "WA", "TLE", "CE", "RE"] as const;

function stamp(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.me(), api.submissions(), api.problems()])
      .then(([profile, list, bank]) => {
        setMe(profile);
        setRows(list.submissions);
        setProblems(bank.problems);
      })
      .catch((err: Error) => setError(err.message || "读不到个人记录。"))
      .finally(() => setLoaded(true));
  }, []);

  const titles = useMemo(() => new Map(problems.map((row) => [row.id, row.title])), [problems]);
  const counts = useMemo(() => {
    const tally: Record<string, number> = { AC: 0, WA: 0, TLE: 0, CE: 0, RE: 0 };
    for (const row of rows) {
      const key = row.verdict || "";
      if (key in tally) tally[key] += 1;
    }
    return tally;
  }, [rows]);
  const attempted = useMemo(() => {
    const seen = new Map<string, SubmissionRow>();
    for (const row of rows) {
      if (!seen.has(row.problem_id)) seen.set(row.problem_id, row);
    }
    return [...seen.values()];
  }, [rows]);
  const solvedProblemIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.verdict === "AC") set.add(r.problem_id);
    }
    return set;
  }, [rows]);

  const diffStats = useMemo(() => {
    let easyTotal = 0, easySolved = 0;
    let midTotal = 0, midSolved = 0;
    let hardTotal = 0, hardSolved = 0;

    for (const p of problems) {
      const isSolved = solvedProblemIds.has(p.id);
      if (p.difficulty < 1000) {
        easyTotal++;
        if (isSolved) easySolved++;
      } else if (p.difficulty <= 1300) {
        midTotal++;
        if (isSolved) midSolved++;
      } else {
        hardTotal++;
        if (isSolved) hardSolved++;
      }
    }
    return {
      easy: { solved: easySolved, total: easyTotal, pct: easyTotal ? Math.round((easySolved / easyTotal) * 100) : 0 },
      mid: { solved: midSolved, total: midTotal, pct: midTotal ? Math.round((midSolved / midTotal) * 100) : 0 },
      hard: { solved: hardSolved, total: hardTotal, pct: hardTotal ? Math.round((hardSolved / hardTotal) * 100) : 0 },
    };
  }, [problems, solvedProblemIds]);

  const tagStats = useMemo(() => {
    const tally = new Map<string, { solved: number; total: number }>();
    for (const p of problems) {
      const isSolved = solvedProblemIds.has(p.id);
      for (const t of p.tags) {
        const cur = tally.get(t) || { solved: 0, total: 0 };
        cur.total++;
        if (isSolved) cur.solved++;
        tally.set(t, cur);
      }
    }
    return [...tally.entries()]
      .sort((a, b) => b[1].solved - a[1].solved || b[1].total - a[1].total)
      .slice(0, 10);
  }, [problems, solvedProblemIds]);

  const last = rows[0] ?? null;
  const acRate = rows.length ? Math.round((counts.AC / rows.length) * 100) : 0;
  const hasVerdicts = rows.some((row) => row.verdict);
  const continueWrong = last && last.verdict && last.verdict !== "AC";

  return (
    <Shell>
      <main className="page wide vf-account">
        <section className="vf-account-band">
          <div className="vf-account-who">
            <span className="vf-account-mark" aria-hidden="true">
              {(me?.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="kicker">个人中心</p>
              <h1>{me?.username ?? "账号"}</h1>
              <p className="lead">
                {ROLE_ZH[me?.role || ""] || me?.role || "选手"}
                {last ? ` · 最近 ${stamp(last.created_at)}` : " · 还没有提交"}
              </p>
            </div>
          </div>
          <dl className="vf-account-nums">
            <div>
              <dt>提交</dt>
              <dd>{me?.submissions ?? 0}</dd>
            </div>
            <div>
              <dt>通过题</dt>
              <dd>{me?.solved ?? 0}</dd>
            </div>
            <div>
              <dt>AC</dt>
              <dd>{counts.AC}</dd>
            </div>
            <div>
              <dt>占比</dt>
              <dd>{rows.length ? `${acRate}%` : "0%"}</dd>
            </div>
          </dl>
        </section>

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        <div className="vf-home-grid">
          <section className="vf-home-panel vf-account-fit">
            <div className="vf-panel-head">
              <h2>做过的题</h2>
              <span className="ghost">{attempted.length} 道</span>
            </div>
            {attempted.length ? (
              <ul className="vf-home-rows">
                {attempted.map((row) => (
                  <li key={row.problem_id}>
                    <Link href={`/problems/${row.problem_id}`}>
                      <span className="pid">{row.problem_id}</span>
                      <span className="vf-home-row-title">{titles.get(row.problem_id) || row.problem_id}</span>
                      <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ghost">还没做过题。从题库挑一道开始。</p>
            )}
          </section>
          <section className="vf-home-panel vf-account-fit">
            <h2>判定构成</h2>
            {hasVerdicts ? (
              <ul className="vf-account-bars">
                {VERDICTS.map((key) => (
                  <li key={key}>
                    <span className={`verdict ${key}`}>{key}</span>
                    <span className="vf-account-bar" aria-hidden="true">
                      <i style={{ width: rows.length ? `${Math.round((counts[key] / rows.length) * 100)}%` : "0%" }} />
                    </span>
                    <strong>{counts[key]}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ghost">还没有判定。</p>
            )}
            <p className="vf-home-more">
              <Link href="/problems">去题库</Link>
              <Link href="/stress">去对拍</Link>
              <Link href="/settings">设置</Link>
            </p>
          </section>
        </div>

        {/* 选手算法能力图谱与难度掌握度看板 */}
        <div className="vf-home-grid" style={{ marginTop: "16px" }}>
          <section className="vf-home-panel vf-account-fit">
            <div className="vf-panel-head">
              <h2>难度攻克掌握度</h2>
              <span className="ghost">{solvedProblemIds.size} / {problems.length} 题</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "8px 0" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                  <span className="diff-easy" style={{ fontWeight: 600 }}>● 入门基础 (&lt;1000)</span>
                  <strong>{diffStats.easy.solved} / {diffStats.easy.total} ({diffStats.easy.pct}%)</strong>
                </div>
                <div className="vf-progress-track">
                  <div className="vf-progress-fill-ac" style={{ width: `${diffStats.easy.pct}%`, background: "var(--ac)" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                  <span className="diff-mid" style={{ fontWeight: 600 }}>● 进阶提高 (1000-1300)</span>
                  <strong>{diffStats.mid.solved} / {diffStats.mid.total} ({diffStats.mid.pct}%)</strong>
                </div>
                <div className="vf-progress-track">
                  <div className="vf-progress-fill-ac" style={{ width: `${diffStats.mid.pct}%`, background: "var(--warning)" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                  <span className="diff-hard" style={{ fontWeight: 600 }}>● 核心压轴 (1400+)</span>
                  <strong>{diffStats.hard.solved} / {diffStats.hard.total} ({diffStats.hard.pct}%)</strong>
                </div>
                <div className="vf-progress-track">
                  <div className="vf-progress-fill-ac" style={{ width: `${diffStats.hard.pct}%`, background: "var(--error)" }} />
                </div>
              </div>
            </div>
          </section>

          <section className="vf-home-panel vf-account-fit">
            <div className="vf-panel-head">
              <h2>高频算法能力图谱</h2>
              <span className="ghost">TOP 10 核心算法标签</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px 0" }}>
              {tagStats.map(([t, stat]) => (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    background: stat.solved > 0 ? "color-mix(in srgb, var(--ac) 12%, var(--surface))" : "var(--surface-2)",
                    border: `1px solid ${stat.solved > 0 ? "color-mix(in srgb, var(--ac) 35%, transparent)" : "var(--border)"}`,
                    color: stat.solved > 0 ? "var(--text)" : "var(--muted)",
                  }}
                >
                  <strong>{t}</strong>
                  <span style={{ fontSize: "11px", color: stat.solved > 0 ? "var(--ac)" : "var(--muted)" }}>
                    {stat.solved}/{stat.total}
                  </span>
                </span>
              ))}
            </div>
          </section>
        </div>

        <section className="vf-account-log">
          <div className="vf-panel-head">
            <h2>提交记录</h2>
            {continueWrong && last ? (
              <Link href={`/problems/${last.problem_id}`}>接着做 {last.problem_id}</Link>
            ) : (
              <Link href="/status">全部提交</Link>
            )}
          </div>
          {!loaded ? (
            <p className="ghost">正在读取记录…</p>
          ) : !rows.length ? (
            <div className="empty">
              <p>还没有提交。</p>
              <Link className="btn" href="/problems">
                去题库
              </Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table vf-account-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>题目</th>
                    <th>判定</th>
                    <th>语言</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((row) => (
                    <tr key={row.id}>
                      <td className="num">
                        <Link href={`/status/${row.id}`}>{row.id}</Link>
                      </td>
                      <td>
                        <Link href={`/status/${row.id}`}>
                          {row.problem_id}
                          {titles.get(row.problem_id) ? ` ${titles.get(row.problem_id)}` : ""}
                        </Link>
                        <span className="ghost"> · 看代码</span>
                      </td>
                      <td>
                        <Link href={`/status/${row.id}`}>
                          <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                        </Link>
                      </td>
                      <td>{row.lang}</td>
                      <td>{stamp(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}
