"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import StatusChip from "@/components/StatusChip";
import { api } from "@/lib/api";

type HistRow = {
  id: number;
  created_at: string;
  workflow_name: string;
  status: string;
  issue_count: number;
  issue_static?: number | null;
  issue_runtime?: number | null;
  parent_run_id?: number;
  coverage: number;
  runtime_status: string;
  gate_ready: string;
  latency_ms: number;
};

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<"all" | "failed" | "blocked" | "runtime">("all");

  useEffect(() => {
    api
      .reportHistory(50)
      .then((data) => setRuns(data.runs))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return runs.filter((row) => {
      if (quick === "failed" && row.status !== "FAIL") return false;
      if (quick === "blocked" && row.gate_ready !== "BLOCKED") return false;
      if (quick === "runtime" && row.runtime_status !== "FAIL") return false;
      if (!query) return true;
      return (
        String(row.id).includes(query) ||
        (row.workflow_name || "").toLowerCase().includes(query) ||
        row.status.toLowerCase().includes(query) ||
        String(row.parent_run_id || "").includes(query)
      );
    });
  }, [runs, q, quick]);

  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>验证历史</h1>
          <p className="lead">Issue 数从 payload 派生（静态 + 运行时），与 Report 一致。点行打开完整 session。</p>
        </header>
        {error ? <p className="err">{error}</p> : null}
        <div className="filter-bar">
          <input
            className="input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="搜索 id / workflow"
            aria-label="搜索历史"
          />
          <div className="seg" role="group" aria-label="快捷筛选">
            {(
              [
                ["all", "全部"],
                ["failed", "Failed"],
                ["blocked", "Blocked"],
                ["runtime", "Runtime FAIL"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={quick === id ? "on" : ""} aria-pressed={quick === id} onClick={() => setQuick(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {!loaded ? (
          <div aria-hidden="true">
            <div className="skel wide" />
            <div className="skel mid" />
          </div>
        ) : !filtered.length ? (
          <div className="empty">
            <p>{runs.length ? "没有符合筛选的记录。" : "还没有验证 run。"}</p>
            <Link className="btn" href="/report?demo=case4_runtime">
              打开验证
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Workflow</th>
                  <th>Run</th>
                  <th>Gate</th>
                  <th>运行时</th>
                  <th className="num">Issues</th>
                  <th className="num">ms</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="num">
                      <Link href={`/report/runs/${row.id}`}>{row.id}</Link>
                    </td>
                    <td>
                      <Link href={`/report/runs/${row.id}`}>{row.workflow_name || "—"}</Link>
                      {row.parent_run_id ? (
                        <span className="caption"> ← #{row.parent_run_id}</span>
                      ) : null}
                    </td>
                    <td>
                      <StatusChip value={row.status} />
                    </td>
                    <td>
                      <StatusChip value={row.gate_ready} />
                    </td>
                    <td>
                      <StatusChip value={row.runtime_status} />
                    </td>
                    <td className="num" title={`static ${row.issue_static ?? "—"} + runtime ${row.issue_runtime ?? "—"}`}>
                      {row.issue_count}
                      {row.issue_runtime ? <span className="caption"> ·rt{row.issue_runtime}</span> : null}
                    </td>
                    <td className="num">{Number(row.latency_ms).toFixed(1)}</td>
                    <td className="mono">{row.created_at?.slice(0, 19).replace("T", " ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="caption">最多 {runs.length} 条。Run=静态总判，Gate=能否入库，运行时=Mock trace。三者含义不同。</p>
      </main>
    </Shell>
  );
}
