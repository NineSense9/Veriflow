"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, SubmissionRow } from "@/lib/api";

const FILTERS = ["全部", "AC", "WA", "TLE", "CE", "RE"];

export default function StatusPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("全部");

  useEffect(() => {
    api
      .submissions()
      .then((data) => setRows(data.submissions))
      .catch((err: { status?: number }) => {
        if (err.status !== 401) setError("状态页读不到提交。");
      });
  }, []);

  const visible = useMemo(
    () => (filter === "全部" ? rows : rows.filter((row) => row.verdict === filter)),
    [rows, filter],
  );

  return (
    <Shell>
      <main className="page wide">
        <div className="kicker">Status</div>
        <h1>提交</h1>
        {error ? <p className="ghost">{error}</p> : null}
        <div className="filters">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === filter ? "on" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {!visible.length ? <p className="ghost">这一栏是空的。</p> : null}
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
            {visible.map((row) => (
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
