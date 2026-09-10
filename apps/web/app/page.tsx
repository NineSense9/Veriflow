"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, ProblemListItem, SubmissionRow } from "@/lib/api";

export default function HomePage() {
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .submissions()
      .then((data) => setSubs(data.submissions))
      .catch((err: { status?: number }) => {
        if (err.status === 401) return;
        setError("训练记录暂时读不到。");
      })
      .finally(() => setLoaded(true));
    api.problems().then((data) => setProblems(data.problems)).catch(() => undefined);
  }, []);

  const latest = subs[0];
  const wa = subs.find((row) => row.verdict === "WA");
  const acCount = subs.filter((row) => row.verdict === "AC").length;

  return (
    <Shell>
      <main className="page">
        <header className="page-head">
          <h1>把样例骗术拆掉</h1>
          <p className="lead">公开样例很小。隐藏测资、对拍和变异才是裁判。</p>
        </header>

        <div className="hero-action">
          <Link className="btn btn-primary" href="/problems/VF1001">
            开始 VF1001
          </Link>
          <Link className="btn" href="/problems">
            题库
          </Link>
          <Link className="btn btn-ghost" href="/stress?id=VF1001">
            对拍
          </Link>
          <Link className="btn btn-ghost" href="/compose">
            出题
          </Link>
        </div>
        <p className="caption">
          VF1001《签到时长》隐藏数据里有 n=1 和 32 位整数溢出。过样例不要得意。
        </p>

        <div className="follow">
          {error ? <p className="ghost">{error}</p> : null}
          {latest ? (
            <p className="latest-line">
              <span className={`verdict ${latest.verdict ?? ""}`}>{latest.verdict}</span>
              <Link href={`/problems/${latest.problem_id}`}>{latest.problem_id}</Link>
              <span className="ghost">
                {latest.lang} · {latest.time_ms ?? "—"} ms
              </span>
            </p>
          ) : loaded ? (
            <p className="caption">还没有提交。从题库写一发即可。</p>
          ) : null}
          {wa ? (
            <p className="caption">最近有 WA。回原题看反例三列，或点教练，不要先翻题解。</p>
          ) : null}
        </div>

        <dl className="metric-strip">
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
            <dd>{latest?.verdict ?? "—"}</dd>
          </div>
        </dl>

        <section className="section">
          <h2 className="section-title">最近提交</h2>
          {!loaded ? (
            <div aria-hidden="true">
              <div className="skel wide" />
              <div className="skel mid" />
              <div className="skel short" />
            </div>
          ) : !subs.length ? (
            <div className="empty">
              <p>提交之后这里会变成成绩条。</p>
              <Link className="btn" href="/problems">
                去题库
              </Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table tight">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>题号</th>
                    <th>判定</th>
                    <th className="num">耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.slice(0, 6).map((row) => (
                    <tr key={row.id}>
                      <td className="num">{row.id}</td>
                      <td>
                        <Link href={`/problems/${row.problem_id}`}>{row.problem_id}</Link>
                      </td>
                      <td>
                        <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict}</span>
                      </td>
                      <td className="num">{row.time_ms ?? "—"} ms</td>
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
