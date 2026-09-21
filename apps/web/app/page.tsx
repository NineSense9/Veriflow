"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import VerificationMiniFlow from "@/components/home/VerificationMiniFlow";
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
        <section className="vf-home-hero vf-home-hero-split" aria-label="验流">
          <div className="vf-home-hero-copy">
            <p className="vf-home-kicker">AI 可靠性验证平台{name ? ` · ${name}` : ""}</p>
            <h1>
              让 AI 出题，
              <br />
              但不让 AI 当裁判。
            </h1>
            <p className="lead">
              AI 负责需求理解与候选生成；形式化规格、反例路径、时序仿真与发布门禁由确定性验证器裁决。
            </p>
            <div className="vf-home-ctas">
              <Link className="btn btn-primary" href="/report?demo=case4_runtime&tour=1">
                3 分钟核心验证演示
              </Link>
              <Link className="btn" href="/compose">
                需求编译工作坊
              </Link>
            </div>
            <p className="vf-home-secondary">基于规格编译、静态检查与时序沙箱，实现确定性安全放行。</p>
          </div>
          <VerificationMiniFlow />
        </section>

        <section className="vf-home-band" aria-label="验证效能指标">
          <div className="vf-home-continue-inline">
            <span className="vf-home-kicker">评测基准</span>
            <strong>55 组全量验证用例</strong>
            <span className="ghost">覆盖结构、时序、数据流与安全</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>缺陷拦截率</span>
          </div>
          <div>
            <strong>84.4%</strong>
            <span>安全修复率</span>
          </div>
          <div>
            <strong>1.4 ms</strong>
            <span>平均核验延迟</span>
          </div>
        </section>

        <section className="vf-home-capabilities" aria-label="核心能力">
          <Link className="vf-home-cap" href="/compose">
            <h2>规格编译</h2>
            <p className="vf-home-cap-en">自然语言需求 → 形式化规格约束</p>
            <p>自动抽取操作边界、前置依赖与门禁条件</p>
          </Link>
          <Link className="vf-home-cap" href="/evidence">
            <h2>证据链分析</h2>
            <p className="vf-home-cap-en">缺陷溯源 → 最小反例执行轨迹</p>
            <p>沙箱捕获执行偏差，毫秒级定位异常节点</p>
          </Link>
          <Link className="vf-home-cap" href="/report">
            <h2>受约束修复</h2>
            <p className="vf-home-cap-en">补丁提案 → 守卫复验 → 门禁放行</p>
            <p>继承原运行时条件，全量核验后安全发布</p>
          </Link>
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
              <div className="vf-home-check-body">
                <h2 id="home-check">安全门禁与修复验证机制</h2>
                <ol className="vf-home-steps">
                  <li>需求规格抽取</li>
                  <li>多维静态与时序检查</li>
                  <li>最小约束补丁生成</li>
                  <li>门禁复核与增量发布</li>
                </ol>
                <p>
                  <span className="verdict WA">高风险</span> MISSING_HUMAN_GATE
                </p>
                <p className="caption">工作流缺少人工审题节点时，门禁将强制阻断；执行受约束修复后方可放行。</p>
                <div className="vf-home-check-actions">
                  <Link className="btn btn-sm" href="/compose?story=1">
                    体验缺少审题门案例
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </Shell>
  );
}
