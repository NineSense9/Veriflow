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
        <section className="vf-home-hero vf-home-hero-split" aria-label="验流">
          <div className="vf-home-hero-copy">
            <p className="vf-home-kicker">可验证算法训练平台 · AI 出题质检门禁{name ? ` · ${name}` : ""}</p>
            <h1>
              让 AI 出题，
              <br />
              但不让 AI 当裁判。
            </h1>
            <p className="lead">
              对外是算法竞赛训练站，内核是「编译—对抗—环境裁判」。选手享受 Docker 沙箱真实评测、三列最小反例与启发式教练；AI 出题流水线在入库前经由确定性时序仿真与门禁熔断，严防脏题。
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
            <span>静态修复接受率</span>
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
            <h2>沙箱裁判与最小反例</h2>
            <p className="vf-home-cap-en">Docker 真实评测 → 三列对比精准定位</p>
            <p>拒绝冰冷 WA；输入、期望与实际输出并排高亮，毫秒级抓取边界挂点</p>
          </Link>
          <Link className="vf-home-cap" href="/stress">
            <h2>智能对抗与沙箱对拍</h2>
            <p className="vf-home-cap-en">生成器 + 暴力解 → 极端边界高频扫荡</p>
            <p>无需编写脚本，预置标程在沙箱内 50~200 轮自动并发对拍抓 Bug</p>
          </Link>
          <Link className="vf-home-cap" href="/problems/VF1001">
            <h2>启发式防剧透教练</h2>
            <p className="vf-home-cap-en">苏格拉底追问 → 严禁剧透完整代码</p>
            <p>针对最小反例启发算法思维，大模型受限只引导思路、保护思考深度</p>
          </Link>
          <Link className="vf-home-cap" href="/report?demo=case4_runtime">
            <h2>AI 出题时序质检门禁</h2>
            <p className="vf-home-cap-en">自然语言编译 → 拓扑检查与沙箱防跳步</p>
            <p>大模型出题先过规格编译与时序模拟；缺少审题门强制熔断，防止垃圾题</p>
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
