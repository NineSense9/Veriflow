"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { Me, ProblemListItem, SubmissionRow, api } from "@/lib/api";

const ROLE_ZH: Record<string, string> = {
  contestant: "选手",
  setter: "出题",
  admin: "管理员",
};

function stamp(value: string) {
  return value.replace("T", " ").slice(0, 19);
}

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api.me(), api.submissions(), api.problems()])
      .then(([profile, list, bank]) => {
        setMe(profile);
        setRows(list.submissions);
        setProblems(bank.problems);
      })
      .catch((err: Error) => setError(err.message || "读不到个人记录。"))
      .finally(() => setLoaded(true));
  }, []);

  const titles = useMemo(() => new Map(problems.map((row) => [row.id, row.title])), [problems]);
  const counts = useMemo(() => {
    const tally: Record<string, number> = { AC: 0, WA: 0, TLE: 0, CE: 0, RE: 0 };
    for (const row of rows) {
      const key = row.verdict || "";
      if (key in tally) tally[key] += 1;
    }
    return tally;
  }, [rows]);
  const attempted = useMemo(() => {
    const seen = new Map<string, SubmissionRow>();
    for (const row of rows) {
      if (!seen.has(row.problem_id)) seen.set(row.problem_id, row);
    }
    return [...seen.values()].slice(0, 8);
  }, [rows]);
  const last = rows[0] ?? null;
  const acRate = rows.length ? Math.round((counts.AC / rows.length) * 100) : 0;

  return (
    <Shell>
      <main className="page wide vf-account">
        <section className="vf-account-hero">
          <div className="vf-account-who">
            <span className="vf-account-mark" aria-hidden="true">
              {(me?.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="kicker">个人中心</p>
              <h1>{me?.username ?? "账号"}</h1>
              <p className="lead">
                {ROLE_ZH[me?.role || ""] || me?.role || "选手"}
                {last ? ` · 最近一次 ${stamp(last.created_at)}` : " · 还没有提交"}
              </p>
            </div>
          </div>
          <div className="vf-account-links">
            <Link className="btn btn-sm" href="/problems">
              去题库
            </Link>
            <Link className="btn btn-sm btn-ghost" href="/settings">
              设置
            </Link>
          </div>
        </section>

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        <section className="vf-home-stats" aria-label="我的记录">
          <div>
            <strong>{me?.submissions ?? 0}</strong>
            <span>次提交</span>
          </div>
          <div>
            <strong>{me?.solved ?? 0}</strong>
            <span>题通过</span>
          </div>
          <div>
            <strong>{counts.AC}</strong>
            <span>次 AC</span>
          </div>
          <div>
            <strong>{rows.length ? `${acRate}%` : "—"}</strong>
            <span>提交通过占比</span>
          </div>
        </section>

        <div className="vf-home-grid">
          <section className="vf-home-panel">
            <h2>做过的题</h2>
            {attempted.length ? (
              <ul className="vf-home-picks">
                {attempted.map((row) => (
                  <li key={row.problem_id}>
                    <Link href={`/problems/${row.problem_id}`}>
                      <span className="pid">{row.problem_id}</span>
                      <span>{titles.get(row.problem_id) || row.problem_id}</span>
                      <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ghost">还没做过题。从题库挑一道开始。</p>
            )}
          </section>
          <section className="vf-home-panel">
            <h2>判定构成</h2>
            <ul className="vf-account-tally">
              {(["AC", "WA", "TLE", "CE", "RE"] as const).map((key) => (
                <li key={key}>
                  <span className={`verdict ${key}`}>{key}</span>
                  <strong>{counts[key]}</strong>
                </li>
              ))}
            </ul>
            <p className="vf-home-more">
              <Link href="/status">全部提交</Link>
              <Link href="/stress">去对拍</Link>
            </p>
          </section>
        </div>

        <section className="vf-account-log">
          <h2>提交记录</h2>
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
                    <th>题目</th>
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
                        <Link href={`/problems/${row.problem_id}`}>
                          {row.problem_id}
                          {titles.get(row.problem_id) ? ` ${titles.get(row.problem_id)}` : ""}
                        </Link>
                      </td>
                      <td>
                        <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                      </td>
                      <td>{row.lang}</td>
                      <td>{stamp(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}
