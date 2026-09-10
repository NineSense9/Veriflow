"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "判定",
    keys: [
      ["problems", "题库题数"],
      ["submissions", "提交次数"],
      ["ac", "AC"],
      ["wa", "WA"],
      ["hidden_wa", "隐藏测资打出的 WA"],
      ["ac_rate", "通过率"],
      ["avg_kill_rate", "平均变异杀死率"],
    ],
  },
  {
    title: "出题",
    keys: [
      ["compose_projects", "出题项目"],
      ["compose_blocked", "编译期拦住"],
    ],
  },
  {
    title: "工具",
    keys: [
      ["tutor_turns", "教练追问"],
      ["stress_runs", "对拍次数"],
      ["stress_mismatch", "对拍拍出反例"],
    ],
  },
];

function format(key: string, value: number | null) {
  if (value === null) return "—";
  if (key.endsWith("_rate")) return `${Math.round(value * 100)}%`;
  return String(value);
}

export default function ReportPage() {
  const [data, setData] = useState<Record<string, number | null> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .report()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);
  return (
    <Shell>
      <main className="page">
        <header className="page-head">
          <h1>对照报告</h1>
          <p className="lead">
            基线是只跑公开样例。完整路径包含隐藏测资、对拍和变异。复现：
            <code>python scripts/eval.py</code>
          </p>
        </header>
        {error ? <p className="err" role="alert">{error}</p> : null}
        {data ? (
          GROUPS.map((group) => (
            <section className="kv-block" key={group.title}>
              <h2>{group.title}</h2>
              <dl className="kv">
                {group.keys.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{format(key, data[key] ?? null)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))
        ) : error ? null : (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
            <div className="skel short" />
          </div>
        )}
        <a className="btn" href="/api/report/export">
          下载 Markdown
        </a>
      </main>
    </Shell>
  );
}
