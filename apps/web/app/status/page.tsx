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
        if (err.status !== 401) setError("无法加载评测记录，请检查网络或服务连接。");
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
          <h1>沙箱判题记录</h1>
          <p className="lead">实时监控与回溯 Docker 沙箱判题结果，毫秒级捕获运行耗时、内存占用与失败反例。点击任意记录可查阅源码与测试点详情。</p>
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
            <p>暂无符合筛选条件的判题记录。</p>
            <Link className="btn" href="/problems">
              前往题库训练
            </Link>
          </div>
        ) : (
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
        )}
      </main>
    </Shell>
  );
}
