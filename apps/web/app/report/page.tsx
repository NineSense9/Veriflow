"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";

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
        <p className="ghost">数字来自当前库。完整复现跑 python scripts/eval.py。</p>
        {error ? <p className="ghost">{error}</p> : null}
        {data ? (
          <table className="table">
            <tbody>
              {Object.entries(data).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td className="verdict AC">{value === null ? "—" : String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p>
          <a className="cta" href="/api/report/export">
            下载 Markdown
          </a>
        </p>
      </main>
    </Shell>
  );
}
