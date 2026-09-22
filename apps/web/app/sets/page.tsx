"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { ProblemListItem, api } from "@/lib/api";

type SetRow = {
  id: string;
  title: string;
  problems: { id: string; title: string }[];
};

export default function SetsPage() {
  const [rows, setRows] = useState<SetRow[] | null>(null);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [solvedSet, setSolvedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    api
      .sets()
      .then((data) => setRows(data.sets))
      .catch(() => setRows([]));

    api
      .problems()
      .then((res) => setProblems(res.problems || []))
      .catch(() => {});

    api
      .submissions()
      .then((res) => {
        const acs = new Set<string>();
        for (const s of res.submissions || []) {
          if (s.verdict === "AC") acs.add(s.problem_id);
        }
        setSolvedSet(acs);
      })
      .catch(() => {});
  }, []);

  const probMap = useMemo(() => {
    return new Map(problems.map((p) => [p.id, p]));
  }, [problems]);

  const globalStats = useMemo(() => {
    if (!rows) return { totalSets: 0, totalUnique: 0, solvedUnique: 0, pct: 0 };
    const allIds = new Set<string>();
    for (const r of rows) {
      for (const p of r.problems) allIds.add(p.id);
    }
    let solved = 0;
    for (const id of allIds) {
      if (solvedSet.has(id)) solved++;
    }
    return {
      totalSets: rows.length,
      totalUnique: allIds.size,
      solvedUnique: solved,
      pct: allIds.size ? Math.round((solved / allIds.size) * 100) : 0,
    };
  }, [rows, solvedSet]);

  return (
    <Shell>
      <main className="page wide vf-sets-page">
        <header className="page-head">
          <p className="kicker">ACM 算法进阶</p>
          <h1>竞赛经典题单</h1>
          <p className="lead">精选高频核心算法专题，构建从入门模拟到动态规划、图论对抗的阶梯式训练图谱。</p>
        </header>

        {rows === null ? (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
          </div>
        ) : !rows.length ? (
          <div className="empty">
            <p>题单暂未上线。</p>
          </div>
        ) : (
          <>
            {/* Global Summary Progress Banner */}
            <section className="vf-problems-progress-card" aria-label="题单攻克进度概览" style={{ marginBottom: 24 }}>
              <div className="vf-problems-progress-info">
                <div className="vf-problems-progress-title">
                  <span className="vf-problems-progress-icon">📚</span>
                  <strong>
                    题单总览：已攻克 {globalStats.solvedUnique} / {globalStats.totalUnique} 题 ({globalStats.pct}%)
                  </strong>
                  <span className="ghost">· 共 {globalStats.totalSets} 个进阶专题</span>
                </div>
                <Link href="/problems" className="btn btn-sm btn-ghost">
                  查看全部题库 →
                </Link>
              </div>
              <div className="vf-progress-track" title={`总完成率 ${globalStats.pct}%`}>
                <div
                  className="vf-progress-fill-ac"
                  style={{ width: `${globalStats.pct}%` }}
                />
              </div>
            </section>

            {/* Set Cards Grid */}
            <div className="vf-sets-grid">
              {rows.map((row) => {
                let setSolved = 0;
                for (const p of row.problems) {
                  if (solvedSet.has(p.id)) setSolved++;
                }
                const setPct = row.problems.length
                  ? Math.round((setSolved / row.problems.length) * 100)
                  : 0;

                return (
                  <section className="vf-set-card" key={row.id}>
                    <div className="vf-set-head">
                      <div className="vf-set-head-main">
                        <span className="vf-set-icon">🎯</span>
                        <div>
                          <h2>{row.title}</h2>
                          <span className="vf-set-count">
                            已攻克 {setSolved} / {row.problems.length} 题 ({setPct}%)
                          </span>
                        </div>
                      </div>
                      <span className={`vf-badge-pct ${setPct === 100 ? "done" : ""}`}>
                        {setPct}%
                      </span>
                    </div>

                    <div className="vf-progress-track" style={{ height: 4, margin: "8px 0 16px" }}>
                      <div
                        className="vf-progress-fill-ac"
                        style={{ width: `${setPct}%` }}
                      />
                    </div>

                    <div className="vf-set-problems">
                      {row.problems.map((problem) => {
                        const meta = probMap.get(problem.id);
                        const isAC = solvedSet.has(problem.id);
                        const diff = meta?.difficulty ?? 1000;
                        const diffClass =
                          diff < 1000 ? "diff-easy" : diff <= 1300 ? "diff-mid" : "diff-hard";

                        return (
                          <Link
                            key={problem.id}
                            href={`/problems/${problem.id}`}
                            className={`vf-set-prob-row ${isAC ? "ac" : ""}`}
                          >
                            <span className={`vf-set-prob-status ${isAC ? "ac" : ""}`}>
                              {isAC ? "✓ AC" : "○"}
                            </span>
                            <span className="vf-set-prob-id">{problem.id}</span>
                            <strong className="vf-set-prob-title">{problem.title}</strong>
                            <span className={`vf-set-prob-diff ${diffClass}`}>
                              {diff}
                            </span>
                            {meta?.tags?.slice(0, 2).map((t) => (
                              <span key={t} className="vf-set-prob-tag">
                                {t}
                              </span>
                            ))}
                            <span className="vf-set-prob-arrow">→</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}
