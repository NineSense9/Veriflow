"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { Me, SubmissionRow, api } from "@/lib/api";

const ROLE_ZH: Record<string, string> = {
  contestant: "选手",
  setter: "出题",
  admin: "管理员",
};

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.me(), api.submissions()])
      .then(([profile, list]) => {
        setMe(profile);
        setRows(list.submissions);
      })
      .catch((err: Error) => setError(err.message || "读不到个人记录。"))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <Shell>
      <main className="page wide">
        <header className="page-head">
          <p className="kicker">个人中心</p>
          <h1>{me?.username ?? "账号"}</h1>
          <p className="lead">
            {me ? `${ROLE_ZH[me.role] || me.role} · ${me.submissions} 次提交 · ${me.solved} 题通过` : "看自己的提交和代码。"}
          </p>
        </header>
        {error ? <p className="err" role="alert">{error}</p> : null}
        <p className="vf-home-more" style={{ marginTop: 0, marginBottom: 16 }}>
          <Link href="/settings">设置</Link>
          <Link href="/status">全部提交</Link>
        </p>
        {!loaded ? (
          <p className="ghost">正在读取记录…</p>
        ) : !rows.length ? (
          <div className="empty">
            <p>还没有提交。</p>
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
                  <th>判定</th>
                  <th>语言</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((row) => (
                  <tr key={row.id}>
                    <td className="num">
                      <Link href={`/status/${row.id}`}>{row.id}</Link>
                    </td>
                    <td>
                      <Link href={`/problems/${row.problem_id}`}>{row.problem_id}</Link>
                    </td>
                    <td>
                      <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                    </td>
                    <td>{row.lang}</td>
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
