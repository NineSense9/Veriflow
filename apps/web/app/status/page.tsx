"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, SubmissionRow } from "@/lib/api";

export default function StatusPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .submissions()
      .then((data) => setRows(data.submissions))
      .catch((err: { status?: number }) => {
        if (err.status !== 401) setError("状态页读不到提交。");
      });
  }, []);

  return (
    <Shell>
      <main className="page">
        <div className="kicker">Status</div>
        <h1>提交</h1>
        {error ? <p className="ghost">{error}</p> : null}
        {!rows.length ? <p className="ghost">还没有记录。</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>题号</th>
              <th>语言</th>
              <th>判定</th>
              <th>耗时</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>
                  <Link href={`/problems/${row.problem_id}`}>{row.problem_id}</Link>
                </td>
                <td>{row.lang}</td>
                <td>
                  <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict}</span>
                </td>
                <td>{row.time_ms ?? "—"} ms</td>
                <td>{row.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </Shell>
  );
}
