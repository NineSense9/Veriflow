"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { AdminProblem, api } from "@/lib/api";

export default function AdminProblemsPage() {
  const [rows, setRows] = useState<AdminProblem[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const data = await api.adminProblems();
      setRows(data.problems);
    } catch (err) {
      setError((err as Error).message || "读不到题库。");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(row: AdminProblem) {
    setError("");
    try {
      await api.adminPublishProblem(row.id, !row.published);
      await refresh();
    } catch (err) {
      setError((err as Error).message || "没改成。");
    }
  }

  return (
    <AdminShell>
      <main className="page wide">
        <header className="page-head">
          <p className="kicker">后台</p>
          <h1>题库</h1>
          <p className="lead">下架的题选手在题库里看不见。不会删测例。</p>
        </header>
        {error ? <p className="err" role="alert">{error}</p> : null}
        {!loaded ? (
          <p className="ghost">正在读取题库…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>题号</th>
                  <th>标题</th>
                  <th className="num">提交</th>
                  <th>状态</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.title}</td>
                    <td className="num">{row.submissions}</td>
                    <td>{row.published ? "已上架" : "已下架"}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(row)}>
                        {row.published ? "下架" : "上架"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminShell>
  );
}
