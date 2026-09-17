"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import BrandAmbient from "@/components/BrandAmbient";
import { Me, ProblemListItem, SubmissionRow, api, currentUsername } from "@/lib/api";

const FEATURED_IDS = ["VF1001", "VF1004", "VF1016"];

function pickFeatured(rows: ProblemListItem[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const picked = FEATURED_IDS.map((id) => byId.get(id)).filter(Boolean) as ProblemListItem[];
  for (const row of rows) {
    if (picked.length >= 3) break;
    if (!picked.some((item) => item.id === row.id)) picked.push(row);
  }
  return picked.slice(0, 3);
}

export default function HomePage() {
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const name = currentUsername();

  useEffect(() => {
    api.problems().then((data) => setProblems(data.problems)).catch(() => undefined);
    api.submissions().then((data) => setSubmissions(data.submissions)).catch(() => undefined);
    api.me().then(setMe).catch(() => undefined);
  }, []);

  const featured = useMemo(() => pickFeatured(problems), [problems]);
  const latest = submissions[0] ?? null;
  const latestProblem = latest ? problems.find((row) => row.id === latest.problem_id) : null;
  const recent = submissions.slice(0, 5);

  return (
    <Shell>
      <main className="page wide vf-home">
        <section className="vf-home-hero" aria-label="训练场">
          <BrandAmbient variant="rays" className="vf-home-hero-ambient" />
          <p className="vf-home-kicker">训练场{name ? ` · ${name}` : ""}</p>
          <h1>刷题、对拍、提交。</h1>
          <p className="lead">打开题就能写代码，对拍帮你找错，交上去用沙箱跑，不是模型自己说对。</p>
          <Link className="btn btn-primary" href="/problems">
            进入题库
          </Link>
        </section>

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
            <strong>{latest?.verdict ?? "—"}</strong>
            <span>最近判定</span>
          </div>
        </section>

        <div className="vf-home-grid vf-home-grid-3">
          <section className="vf-home-panel" aria-labelledby="home-recent">
            <h2 id="home-recent">最近提交</h2>
            {recent.length ? (
              <ul className="vf-home-picks">
                {recent.map((row) => (
                  <li key={row.id}>
                    <Link href={`/status/${row.id}`}>
                      <span className="pid">{row.problem_id}</span>
                      <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ghost">尚未提交。先从旁边选一道。</p>
            )}
            {latest && latestProblem ? (
              <p className="vf-home-continue">
                接着做 <Link href={`/problems/${latest.problem_id}`}>{latest.problem_id} {latestProblem.title}</Link>
              </p>
            ) : null}
            <p className="vf-home-more">
              <Link href="/account">个人中心</Link>
              <Link href="/status">全部提交</Link>
            </p>
          </section>

          <section className="vf-home-panel" aria-labelledby="home-practice">
            <h2 id="home-practice">可以从这些题开始</h2>
            <ul className="vf-home-picks">
              {featured.map((row) => (
                <li key={row.id}>
                  <Link href={`/problems/${row.id}`}>
                    <span className="pid">{row.id}</span>
                    <span>{row.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="vf-home-more">
              <Link href="/stress">去对拍</Link>
              <Link href="/problems">全部题目</Link>
            </p>
          </section>

          <section className="vf-home-panel vf-home-check" aria-labelledby="home-check">
            <h2 id="home-check">AI 也可以出题</h2>
            <p>起草之后要先验过，才能进题库。</p>
            <Link className="btn btn-sm" href="/compose?story=1">
              去出一道题
            </Link>
            <p className="vf-home-more">
              <Link href="/account">看我的记录</Link>
            </p>
          </section>
        </div>
      </main>
    </Shell>
  );
}
