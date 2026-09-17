"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import BrandAmbient from "@/components/BrandAmbient";
import { Me, ProblemListItem, SubmissionRow, api, currentUsername } from "@/lib/api";

const FEATURED_IDS = ["VF1001", "VF1004", "VF1016"];

function stamp(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

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
  const fallback = problems.find((row) => row.id === "VF1001") ?? featured[0] ?? null;
  const continueTo = latestProblem ?? fallback;
  const recent = submissions.slice(0, 6);
  const titles = useMemo(() => new Map(problems.map((row) => [row.id, row.title])), [problems]);

  return (
    <Shell>
      <main className="page wide vf-home">
        <section className="vf-home-hero vf-home-hero-split" aria-label="训练场">
          <BrandAmbient variant="rays" className="vf-home-hero-ambient" />
          <div className="vf-home-hero-copy">
            <p className="vf-home-kicker">训练场{name ? ` · ${name}` : ""}</p>
            <h1>刷题、对拍、提交。</h1>
            <p className="lead">打开题就能写代码，对拍帮你找错，交上去用沙箱跑，不是模型自己说对。</p>
            <Link className="btn btn-primary" href="/problems">
              进入题库
            </Link>
          </div>
          <figure className="vf-home-print">
            <img src="/home/print-hero-mint.jpg" alt="" />
          </figure>
        </section>

        <section className="vf-home-band" aria-label="我的记录">
          <Link className="vf-home-continue-inline" href={continueTo ? `/problems/${continueTo.id}` : "/problems"}>
            <span className="vf-home-kicker">{latest ? "接着做" : "从这道开始"}</span>
            <strong>{continueTo ? `${continueTo.id} ${continueTo.title}` : "题库"}</strong>
            <span>
              {latest ? (
                <>
                  <span className={`verdict ${latest.verdict ?? ""}`}>{latest.verdict ?? "—"}</span>
                  <span className="ghost"> {stamp(latest.created_at)}</span>
                </>
              ) : (
                "先做签到题"
              )}
            </span>
          </Link>
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

        <div className="vf-home-grid">
          <section className="vf-home-panel" aria-labelledby="home-recent">
            <div className="vf-panel-head">
              <h2 id="home-recent">最近提交</h2>
              <Link href="/status">全部</Link>
            </div>
            {recent.length ? (
              <ul className="vf-home-rows">
                {recent.map((row) => (
                  <li key={row.id}>
                    <Link href={`/status/${row.id}`}>
                      <span className="pid">{row.problem_id}</span>
                      <span className="vf-home-row-title">{titles.get(row.problem_id) || row.problem_id}</span>
                      <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                      <span className="ghost">{stamp(row.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ghost">尚未提交。右边可以先挑一道。</p>
            )}
          </section>

          <div className="vf-home-stack">
            <section className="vf-home-panel" aria-labelledby="home-practice">
              <div className="vf-panel-head">
                <h2 id="home-practice">推荐题</h2>
                <Link href="/problems">题库</Link>
              </div>
              <ul className="vf-home-rows">
                {featured.map((row) => (
                  <li key={row.id}>
                    <Link href={`/problems/${row.id}`}>
                      <span className="pid">{row.id}</span>
                      <span className="vf-home-row-title">{row.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="vf-home-panel vf-home-check" aria-labelledby="home-check">
              <img className="vf-home-panel-photo" src="/home/print-flow-wide.jpg" alt="" />
              <div className="vf-home-check-body">
                <h2 id="home-check">AI 也可以出题</h2>
                <p>起草之后要先验过，才能进题库。</p>
                <div className="vf-home-check-actions">
                  <Link className="btn btn-sm" href="/compose?story=1">
                    去出一道题
                  </Link>
                  <Link href="/stress">去对拍</Link>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </Shell>
  );
}
