"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, ProblemListItem, SubmissionRow } from "@/lib/api";

export default function HomePage() {
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .submissions()
      .then((data) => setSubs(data.submissions))
      .catch((err: { status?: number }) => {
        if (err.status === 401) return;
        setError("训练记录暂时读不到。");
      });
    api.problems().then((data) => setProblems(data.problems)).catch(() => undefined);
  }, []);

  const latest = subs[0];
  const wa = subs.find((row) => row.verdict === "WA");

  return (
    <Shell>
      <main className="page">
        <div className="kicker">Training hub</div>
        <h1>把样例骗术拆掉</h1>
        <div className="desk-grid">
          <section className="paper-card">
            <h2 style={{ marginTop: 0, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 12 }}>
              下一题
            </h2>
            <p>
              从 VF1001《签到时长》开始。公开样例很小，隐藏数据里有 n=1 和 32
              位整数溢出。过样例不要得意。裁判是沙箱，不是模型。
            </p>
            <Link className="cta" href="/problems/VF1001" style={{ color: "#7a3b2e", borderColor: "#7a3b2e" }}>
              打开试卷 VF1001
            </Link>
          </section>
          <section className="card">
            <h2>上一发</h2>
            {error ? <p className="ghost">{error}</p> : null}
            {!latest ? (
              <p className="ghost">还没有提交。空桌也行，先写一发。</p>
            ) : (
              <p>
                <span className={`verdict ${latest.verdict ?? ""}`}>{latest.verdict}</span>
                {"  "}
                <Link href={`/problems/${latest.problem_id}`}>{latest.problem_id}</Link>
                {" · "}
                {latest.lang} · {latest.time_ms ?? "—"} ms
              </p>
            )}
            {wa ? (
              <p className="ghost">最近有 WA。去原题看反例三列，或点教练，不要先翻题解。</p>
            ) : null}
            <p style={{ marginTop: 18 }}>
              <Link className="cta" href="/stress?id=VF1001">
                对拍台
              </Link>
              {"  "}
              <Link className="cta" href="/compose">
                出题画布
              </Link>
            </p>
          </section>
        </div>
        <div className="kicker" style={{ marginTop: 36 }}>
          Recent
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>题号</th>
              <th>判定</th>
              <th>耗时</th>
            </tr>
          </thead>
          <tbody>
            {subs.slice(0, 6).map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>
                  <Link href={`/problems/${row.problem_id}`}>{row.problem_id}</Link>
                </td>
                <td>
                  <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict}</span>
                </td>
                <td>{row.time_ms ?? "—"} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!subs.length ? <p className="ghost">提交之后这里会变成成绩条。</p> : null}
        <p className="ghost" style={{ marginTop: 22 }}>
          题库 {problems.length} 题 · 模型当编译器和攻击者，Docker 当裁判。
        </p>
      </main>
    </Shell>
  );
}
