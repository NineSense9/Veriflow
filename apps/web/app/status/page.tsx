"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, SubmissionRow } from "@/lib/api";

const FILTERS = ["全部", "AC", "WA", "TLE", "CE", "RE"];
const PAGE_SIZE = 20;

export default function StatusPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("全部");
  const [problemSearch, setProblemSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .submissions()
      .then((data) => setRows(data.submissions))
      .catch((err: { status?: number }) => {
        if (err.status !== 401) setError("无法加载评测记录，请检查网络或服务连接。");
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, problemSearch]);

  const filtered = useMemo(() => {
    const p = problemSearch.trim().toLowerCase();
    return rows.filter((row) => {
      const filterOk = filter === "全部" || row.verdict === filter;
      const problemOk = !p || row.problem_id.toLowerCase().includes(p);
      return filterOk && problemOk;
    });
  }, [rows, filter, problemSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  return (
    <Shell>
      <main className="page wide">
        <header className="page-head">
          <h1>沙箱判题记录</h1>
          <p className="lead">实时监控与回溯 Docker 沙箱判题结果，毫秒级捕获运行耗时、内存占用与失败反例。点击任意记录可查阅源码与测试点详情。</p>
        </header>
        {error ? <p className="err" role="alert">{error}</p> : null}

        <div className="toolbar" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", margin: "16px 0" }}>
          <div className="filters" aria-label="判定筛选" style={{ margin: 0 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
            <input
              type="text"
              className="search"
              placeholder="搜索题目编号（如 VF1001）..."
              value={problemSearch}
              onChange={(e) => setProblemSearch(e.target.value)}
              style={{ width: "240px", height: "34px", padding: "4px 10px", margin: 0 }}
            />
            <span className="ghost" style={{ fontSize: "13px", whiteSpace: "nowrap" }}>
              共 {filtered.length} 条
            </span>
          </div>
        </div>

        {!loaded ? (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
          </div>
        ) : !filtered.length ? (
          <div className="empty">
            <p>暂无符合筛选条件的判题记录。</p>
            <Link className="btn" href="/problems">
              前往题库训练
            </Link>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="num">评测 ID</th>
                    <th>题目编号</th>
                    <th>提交语言</th>
                    <th>判题结果</th>
                    <th className="num">沙箱耗时</th>
                    <th>提交时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td className="num">
                        <Link href={`/status/${row.id}`}>#{row.id}</Link>
                      </td>
                      <td>
                        <Link href={`/status/${row.id}`}>{row.problem_id}</Link>
                      </td>
                      <td>{row.lang}</td>
                      <td>
                        <Link href={`/status/${row.id}`}>
                          <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict}</span>
                        </Link>
                      </td>
                      <td className="num">{row.time_ms ?? "—"} ms</td>
                      <td>{row.created_at.replace("T", " ").slice(0, 19)}</td>
                      <td>
                        <Link href={`/status/${row.id}`} style={{ fontSize: "13px" }}>查看详情 →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div
                className="pagination"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "16px",
                  padding: "10px 4px",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <span className="ghost" style={{ fontSize: "13px" }}>
                  显示第 {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, filtered.length)} 条，共 {filtered.length} 条
                </span>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← 上一页
                  </button>
                  <span style={{ fontSize: "13px", fontWeight: 600, minWidth: "48px", textAlign: "center" }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    下一页 →
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </main>
    </Shell>
  );
}
