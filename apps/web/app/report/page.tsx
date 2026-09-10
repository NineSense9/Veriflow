"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";

const LABELS: Record<string, string> = {
  problems: "题库题数",
  submissions: "提交次数",
  ac: "AC",
  wa: "WA",
  hidden_wa: "隐藏测资打出的 WA",
  ac_rate: "通过率",
  avg_kill_rate: "平均变异杀死率",
  compose_projects: "出题项目",
  compose_blocked: "编译期拦住",
  tutor_turns: "教练追问",
  stress_runs: "对拍次数",
  stress_mismatch: "对拍拍出反例",
};

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
        <div className="kicker">Contrast</div>
        <h1>对照报告</h1>
        <p className="ghost">
          基线是只跑公开样例。完整路径包含隐藏测资、对拍和变异。复现命令：
          <code> python scripts/eval.py</code>
        </p>
        {error ? <p className="ghost">{error}</p> : null}
        {data ? (
          <div className="stat-grid">
            {Object.entries(LABELS).map(([key, label]) => (
              <div className="stat" key={key}>
                <b>{format(key, data[key] ?? null)}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        ) : null}
        <a className="cta" href="/api/report/export">
          下载 Markdown
        </a>
      </main>
    </Shell>
  );
}
