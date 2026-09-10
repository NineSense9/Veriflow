"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, ProblemListItem } from "@/lib/api";

function rate(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export default function ProblemsPage() {
  const [rows, setRows] = useState<ProblemListItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .problems()
      .then((data) => setRows(data.problems))
      .catch(() => setError("题库还没挂上。确认 API 已启动。"));
  }, []);

  return (
    <Shell>
      <main className="page">
        <div className="kicker">Problemset</div>
        <h1>题库</h1>
        {error ? <p className="ghost">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>编号</th>
              <th>标题</th>
              <th>难度</th>
              <th>标签</th>
              <th>通过率</th>
              <th>变异杀死率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/problems/${row.id}`}>{row.id}</Link>
                </td>
                <td>
                  <Link href={`/problems/${row.id}`}>{row.title}</Link>
                </td>
                <td>{row.difficulty}</td>
                <td>
                  {row.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </td>
                <td>{rate(row.ac_rate)}</td>
                <td>{row.kill_rate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </Shell>
  );
}
