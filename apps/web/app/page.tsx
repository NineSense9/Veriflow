"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import VerificationMiniFlow from "@/components/home/VerificationMiniFlow";
import { Me, ProblemListItem, SubmissionRow, api, currentUsername, unwrapBench } from "@/lib/api";

const FEATURED_IDS = ["VF1001", "VF1004", "VF1016"];

function stamp(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

function benchNum(value: unknown, digits = 3) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
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
  const [bench, setBench] = useState<Record<string, unknown> | null>(null);
  const name = currentUsername();

  useEffect(() => {
    api.problems().then((data) => setProblems(data.problems)).catch(() => undefined);
    api.submissions().then((data) => setSubmissions(data.submissions)).catch(() => undefined);
    api.me().then(setMe).catch(() => undefined);
    api.benchLatest().then((data) => setBench(unwrapBench(data))).catch(() => undefined);
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
        <section className="vf-home-hero vf-home-hero-split" aria-label="VeriFlow">
          <div className="vf-home-hero-copy">
            <p className="vf-home-kicker">可验证算法训练平台 · AI 出题质检门禁{name ? ` · ${name}` : ""}</p>
            <h1>
              AI 提出草案，
              <br />
              确定性规则当裁判。
            </h1>
            <p className="lead">
              算法竞赛训练支持沙箱判题、三列失败反例与启发教练。AI 提出的出题工作流先经过静态检查和模拟轨迹验证，再进行题包校验、人工审核与发布入库。
            </p>
            <div className="vf-home-ctas">
              <Link className="btn btn-primary" href="/problems">
                进入题库训练
              </Link>
              <Link className="btn" href="/report?demo=case4_runtime&tour=1">
                AI 出题质检演示
              </Link>
            </div>
            <p className="vf-home-secondary">
              快捷通道：<Link href="/stress" style={{ textDecoration: "underline" }}>智能对拍对抗</Link> · <Link href="/compose" style={{ textDecoration: "underline" }}>需求编译出题</Link> · <Link href="/status" style={{ textDecoration: "underline" }}>沙箱判题记录</Link>
            </p>
          </div>
          <VerificationMiniFlow />
        </section>

        <section className="vf-home-band" aria-label="验证效能指标">
          <div className="vf-home-continue-inline">
            <span className="vf-home-kicker">合成变异套件</span>
            <strong>{bench ? `${benchNum(bench.total, 0)} 组` : "—"}</strong>
            <span className="ghost">
              正常 {benchNum(bench?.n_clean, 0)} · 故障 {benchNum(bench?.n_faulty ?? bench?.n, 0)} ·{" "}
              <Link href="/benchmark">不是公开榜</Link>
            </span>
          </div>
          <div>
            <strong>{benchNum(bench?.detection_f1)}</strong>
            <span>检测 F1</span>
          </div>
          <div>
            <strong>{benchNum(bench?.repair_success_rate)}</strong>
            <span>最终静态修复通过率</span>
          </div>
          <div>
            <strong>
              {typeof bench?.average_static_ms === "number" ? `${benchNum(bench.average_static_ms, 1)} ms` : "—"}
            </strong>
            <span>平均静态核验</span>
          </div>
        </section>

        <section className="vf-home-capabilities" aria-label="核心能力">
          <Link className="vf-home-cap" href="/problems/VF1001">
            <h2>沙箱判题与失败反例</h2>
            <p className="vf-home-cap-en">执行测试 → 输入、期望与实际输出</p>
            <p>记录失败测试与评测耗时，三列输出并排显示，便于检查结果差异。</p>
          </Link>
          <Link className="vf-home-cap" href="/stress">
            <h2>智能对抗与沙箱对拍</h2>
            <p className="vf-home-cap-en">生成器 + 暴力解 → 比较程序输出</p>
            <p>预置生成器与暴力解在沙箱内按所选轮次运行，发现输出差异后记录反例。</p>
          </Link>
          <Link className="vf-home-cap" href="/problems/VF1001">
            <h2>启发教练</h2>
            <p className="vf-home-cap-en">围绕反例提问 → 检查算法思路</p>
            <p>根据已记录的失败测试提问，帮助你检查边界条件与算法思路。</p>
          </Link>
          <Link className="vf-home-cap" href="/report?demo=case4_runtime">
            <h2>AI 出题时序质检门禁</h2>
            <p className="vf-home-cap-en">需求规格 → 静态检查与模拟轨迹验证</p>
            <p>静态检查可以通过。CASE 4 的轨迹在支付分支后截断，审题门仍在图上，门禁因此拦截。</p>
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
                <h2 id="home-check">门禁与修复验证</h2>
                <ol className="vf-home-steps">
                  <li>需求规格抽取</li>
                  <li>多维静态与时序检查</li>
                  <li>受约束补丁与完整复验</li>
                  <li>题包校验、人工审核与发布</li>
                </ol>
                <p>
                  <span className="verdict WA">高风险</span> MISSING_HUMAN_GATE
                </p>
                <p className="caption">工作流缺少审题门时会被拦截。修复后需复验，题包校验和人工审核通过后才能发布。</p>
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
