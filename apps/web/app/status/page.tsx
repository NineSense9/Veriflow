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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .submissions()
      .then((data) => setRows(data.submissions))
      .catch((err: { status?: number }) => {
        if (err.status !== 401) setError("状态页读不到提交。");
      })
      .finally(() => setLoaded(true));
  }, []);

  const visible = useMemo(
    () => (filter === "全部" ? rows : rows.filter((row) => row.verdict === filter)),
    [rows, filter],
  );

  return (
    <Shell>
      <main className="page wide">
        <header className="page-head">
          <h1>提交记录</h1>
          <p className="lead">按判定筛选。耗时来自沙箱实测。</p>
        </header>
        {error ? <p className="err" role="alert">{error}</p> : null}
        <div className="filters" aria-label="判定筛选">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === filter ? "on" : ""}
              aria-pressed={item === filter}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {!loaded ? (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
          </div>
        ) : !visible.length ? (
          <div className="empty">
            <p>这一栏是空的。</p>
            <Link className="btn" href="/problems">
              去题库
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>题号</th>
                  <th>语言</th>
                  <th>判定</th>
                  <th className="num">耗时</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td className="num">
                      <Link href={`/status/${row.id}`}>{row.id}</Link>
                    </td>
                    <td>
                      <Link href={`/problems/${row.problem_id}`}>{row.problem_id}</Link>
                    </td>
                    <td>{row.lang}</td>
                    <td>
                      <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict}</span>
                    </td>
                    <td className="num">{row.time_ms ?? "—"} ms</td>
                    <td>{row.created_at.replace("T", " ").slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Shell>
  );
}
