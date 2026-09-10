"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, SubmissionRow } from "@/lib/api";

export default function HomePage() {
  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .submissions()
      .then((data) => setSubs(data.submissions))
      .catch((err: { status?: number }) => {
        if (err.status === 401) return;
        setError("训练记录暂时读不到。");
      });
  }, []);

  const latest = subs[0];
  const wa = subs.find((row) => row.verdict === "WA");

  return (
    <Shell>
      <main className="page">
        <div className="kicker">Night contest desk</div>
        <h1>今晚先把样例骗术拆掉</h1>
        <div className="desk-grid">
          <section className="paper-card">
            <h2 style={{ marginTop: 0 }}>下一题</h2>
            <p>
              从 VF1001《签到时长》开始。公开样例很小，隐藏数据里有 n=1 和 32
              位整数溢出。过样例不要得意。
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
                {latest.problem_id} · {latest.lang} · {latest.time_ms ?? "—"} ms
              </p>
            )}
            {wa ? (
              <p className="ghost">最近有 WA。去状态页或原题里看反例三列，不要先翻题解。</p>
            ) : null}
          </section>
        </div>
      </main>
    </Shell>
  );
}
