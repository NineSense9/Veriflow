"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import CopyButton from "@/components/CopyButton";
import Scanner from "@/components/reactbits/Scanner";
import { effectsAllowScan, useEffects } from "@/lib/effects";
import {
  CPP_STUB,
  PYTHON_STUB,
  ProblemListItem,
  StressKit,
  StressResult,
  api,
} from "@/lib/api";

type Lang = "python3" | "cpp17";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });

function StressInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initialId = search.get("id") || "VF1001";
  const urlLang = search.get("lang");
  const initialLang: Lang = urlLang === "cpp17" ? "cpp17" : "python3";
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [problemId, setProblemId] = useState(initialId);
  const [kit, setKit] = useState<StressKit | null>(null);
  const [gen, setGen] = useState("");
  const [brute, setBrute] = useState("");
  const [sol, setSol] = useState(initialLang === "cpp17" ? CPP_STUB : PYTHON_STUB);
  const [genLang, setGenLang] = useState<Lang>("python3");
  const [bruteLang, setBruteLang] = useState<Lang>("python3");
  const [solLang, setSolLang] = useState<Lang>(initialLang);
  const [rounds, setRounds] = useState(50);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StressResult | null>(null);
  const [error, setError] = useState("");
  const [seedNotice, setSeedNotice] = useState<string | null>(null);
  const { effects } = useEffects();

  useEffect(() => {
    api.problems().then((data) => setProblems(data.problems)).catch(() => undefined);
  }, []);

  useEffect(() => {
    setResult(null);
    setError("");
    api
      .kit(problemId)
      .then((next) => {
        setKit(next);
        setGen(next.gen_source ?? "");
        setBrute(next.brute_source ?? "");
      })
      .catch((err: Error & { status?: number }) => {
        if (err.status !== 401) setError(err.message || "题包加载失败");
      });

    // 0. Check if user came from a failed submission counterexample bridge
    try {
      const seedRaw = sessionStorage.getItem(`vf_stress_seed_${problemId}`);
      if (seedRaw) {
        sessionStorage.removeItem(`vf_stress_seed_${problemId}`);
        const parsed = JSON.parse(seedRaw);
        if (parsed?.counterexample) {
          const previewIn = parsed.counterexample.stdin ? String(parsed.counterexample.stdin).replace(/\s+/g, " ").trim() : "空";
          setSeedNotice(
            parsed.subId
              ? `已从评测记录 #${parsed.subId} 载入代码与反例（样例输入: ${previewIn.slice(0, 24)}${previewIn.length > 24 ? "…" : ""}）`
              : "已从评测记录载入代码与失败反例。"
          );
        }
      }
    } catch {}

    // 1. Prioritize draft/code passed from problem arena via sessionStorage
    let loaded = false;
    try {
      const raw = sessionStorage.getItem(`vf_code_${problemId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.source) {
          setSol(parsed.source);
          if (parsed.lang === "cpp17" || parsed.lang === "python3") {
            setSolLang(parsed.lang);
          }
          loaded = true;
        }
      }
    } catch {}

    // 2. Fallback to user's latest submission for this problem
    if (!loaded) {
      api
        .review(problemId)
        .then((data) => {
          if (data.submission?.source) {
            setSol(data.submission.source);
            if (data.submission.lang === "cpp17" || data.submission.lang === "python3") {
              setSolLang(data.submission.lang);
            }
          }
        })
        .catch(() => undefined);
    }
  }, [problemId]);

  async function run() {
    setBusy(true);
    setError("");
    const { setAmbientActivity } = await import("@/lib/ambient-activity");
    setAmbientActivity("running");
    try {
      const next = await api.stress(problemId, {
        sol_lang: solLang,
        sol_source: sol,
        gen_lang: genLang,
        gen_source: gen,
        brute_lang: bruteLang,
        brute_source: brute,
        rounds,
      });
      setResult(next);
    } catch (err) {
      setError((err as Error).message || "对拍失败");
    } finally {
      setBusy(false);
      const { setAmbientActivity } = await import("@/lib/ambient-activity");
      setAmbientActivity("idle");
    }
  }

  const disabled = !kit?.has_brute;

  return (
    <Shell>
      <div className="stress" style={{ position: "relative" }}>
        {busy && effectsAllowScan(effects) ? <Scanner active /> : null}
        <header className="stress-head">
          <div className="arena-top">
            <span className="pid">对拍</span>
            <label className="sr-only" htmlFor="stress-problem">
              题目
            </label>
            <select id="stress-problem" value={problemId} onChange={(e) => setProblemId(e.target.value)}>
              {(problems.length ? problems : [{ id: problemId, title: problemId }]).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id} {row.title ?? ""}
                </option>
              ))}
            </select>
            <h1>{kit?.title ?? "对拍台"}</h1>
            <label style={{ display: "flex", alignItems: "center" }}>
              轮次
              <input
                type="number"
                min={1}
                max={200}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                aria-label="对拍轮次"
                style={{ width: 60, marginLeft: 8 }}
              />
              <span className="stress-presets">
                {[20, 50, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`stress-preset-btn ${rounds === p ? "active" : ""}`}
                    onClick={() => setRounds(p)}
                    title={`设置为 ${p} 轮`}
                  >
                    {p}
                  </button>
                ))}
              </span>
            </label>
            <button className="primary" type="button" disabled={busy || disabled} data-click-fx="strong" onClick={run}>
              {busy ? "⚡ 对拍中..." : "开拍"}
            </button>
          </div>
          <div className="stress-banner">
            <span className="stress-banner-tag">对拍机制</span>
            <span>已加载该题预置测资生成器与暴力标程，点击「开拍」即在沙箱中高频对比 50~200 轮，毫秒级捕获边界反例。</span>
          </div>
          {seedNotice ? (
            <div className="stress-banner vf-stress-imported-banner" style={{ borderColor: "var(--brand, #4f46e5)", background: "rgba(79, 70, 229, 0.08)" }}>
              <span className="stress-banner-tag" style={{ background: "var(--brand, #4f46e5)", color: "#fff" }}>已就绪</span>
              <span>{seedNotice} 可直接点击右上角「开拍」进行沙箱高频对拍验证！</span>
            </div>
          ) : null}
          {disabled ? (
            <div className="stress-banner" style={{ color: "var(--wa)" }}>
              <span className="stress-banner-tag" style={{ color: "var(--wa)", background: "var(--wa-soft)" }}>提示</span>
              <span>本题暂未配置基准暴力解，对拍功能暂不可用。</span>
            </div>
          ) : null}
        </header>
        <div className="stress-cols">
          <div className="stress-col">
            <h2>
              <span>生成器</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {kit?.gen_source && gen !== kit.gen_source ? (
                  <button
                    type="button"
                    className="stress-action-btn"
                    title="重置为题目预置测资生成器"
                    onClick={() => {
                      setGen(kit.gen_source ?? "");
                      setGenLang("python3");
                    }}
                  >
                    重置
                  </button>
                ) : null}
                <select aria-label="生成器语言" value={genLang} onChange={(e) => setGenLang(e.target.value as Lang)}>
                  <option value="python3">Python3</option>
                  <option value="cpp17">C++17</option>
                </select>
              </div>
            </h2>
            <CodeEditor language={genLang === "cpp17" ? "cpp" : "python"} value={gen} onChange={setGen} />
          </div>
          <div className="stress-col">
            <h2>
              <span>暴力解</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {kit?.brute_source && brute !== kit.brute_source ? (
                  <button
                    type="button"
                    className="stress-action-btn"
                    title="重置为题目预置暴力解"
                    onClick={() => {
                      setBrute(kit.brute_source ?? "");
                      setBruteLang("python3");
                    }}
                  >
                    重置
                  </button>
                ) : null}
                <select aria-label="暴力解语言" value={bruteLang} onChange={(e) => setBruteLang(e.target.value as Lang)}>
                  <option value="python3">Python3</option>
                  <option value="cpp17">C++17</option>
                </select>
              </div>
            </h2>
            <CodeEditor language={bruteLang === "cpp17" ? "cpp" : "python"} value={brute} onChange={setBrute} />
          </div>
          <div className="stress-col">
            <h2>
              <span>选手程序</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  className="stress-action-btn"
                  title="一键将中间栏的暴力解导入到选手程序，便于立即开拍对比或作为优化基线"
                  disabled={!brute}
                  onClick={() => {
                    if (brute) {
                      setSol(brute);
                      setSolLang(bruteLang);
                    }
                  }}
                >
                  ⚡ 导入暴力解
                </button>
                <select
                  aria-label="选手语言"
                  value={solLang}
                  onChange={(e) => {
                    const next = e.target.value as Lang;
                    setSolLang(next);
                    if (sol === PYTHON_STUB && next === "cpp17") setSol(CPP_STUB);
                    if (sol === CPP_STUB && next === "python3") setSol(PYTHON_STUB);
                  }}
                >
                  <option value="python3">Python3</option>
                  <option value="cpp17">C++17</option>
                </select>
              </div>
            </h2>
            <CodeEditor language={solLang === "cpp17" ? "cpp" : "python"} value={sol} onChange={setSol} />
          </div>
        </div>
        <div className="stress-floor">
          <div className="stress-log">
            <div className="kicker">日志</div>
            {error ? <div className="err" role="alert">{error}</div> : null}
            {busy ? (
              <div className="stress-running-box">
                <span className="stress-running-pulse" />
                <span>
                  <strong>沙箱高速对拍中</strong> · 正在以单容器批处理模式运行 <strong>{rounds} 轮</strong> 模糊测试...
                </span>
              </div>
            ) : null}
            {result ? (
              <div style={{ marginBottom: 10 }}>
                <span className={`verdict ${result.status === "mismatch" ? "WA" : result.status === "no_fail" ? "AC" : "TLE"}`}>
                  {result.status === "no_fail" ? "AC 全部通过" : result.status === "mismatch" ? "WA 捕获反例" : result.status}
                </span>
                {"  "}
                <strong>{result.rounds_ran} 轮</strong> · 耗时 <strong>{result.time_ms} ms</strong>
                {result.rounds_ran > 0 ? (
                  <span className="ghost"> (平均 {(result.time_ms / result.rounds_ran).toFixed(1)} ms/轮)</span>
                ) : null}
                {" · "}
                <span className="ghost">{result.sandbox === "docker" ? "Docker 容器沙箱" : result.sandbox}</span>
                {result.detail ? ` · ${result.detail}` : ""}
              </div>
            ) : null}
            {result?.log.map((line) => (
              <div
                key={line.round}
                className={
                  line.status === "ok" ? "ok" : line.status === "mismatch" ? "bad" : "err"
                }
              >
                #{line.round} {line.role ? `${line.role} ` : ""}
                {line.status}
              </div>
            ))}
          </div>
          <aside className="side">
            <h2>第一条反例</h2>
            {result?.counterexample ? (
              <>
                <div className="sample-head">
                  <span>第一条反例</span>
                  <CopyButton
                    text={`stdin\n${result.counterexample.stdin}\nbrute\n${result.counterexample.expected}\nsol\n${result.counterexample.actual}`}
                    label="复制反例"
                  />
                </div>
                <div className="diff">
                  <div>
                    <strong>输入</strong>
                    {"\n"}
                    {result.counterexample.stdin}
                  </div>
                  <div>
                    <strong>暴力</strong>
                    {"\n"}
                    {result.counterexample.expected}
                  </div>
                  <div className="fail">
                    <strong>选手</strong>
                    {"\n"}
                    {result.counterexample.actual}
                  </div>
                </div>
                <button
                  type="button"
                  className="vf-stress-debug-btn"
                  title="将当前反例测试点和选手代码带入做题竞技场进行针对性调试"
                  onClick={() => {
                    try {
                      sessionStorage.setItem(
                        `vf_debug_case_${problemId}`,
                        JSON.stringify({
                          counterexample: result.counterexample,
                          source: sol,
                          lang: solLang,
                        })
                      );
                      sessionStorage.setItem(`vf_code_${problemId}`, JSON.stringify({ lang: solLang, source: sol }));
                      sessionStorage.setItem(`vf_code_${problemId}_${solLang}`, sol);
                    } catch {}
                    router.push(`/problems/${problemId}`);
                  }}
                >
                  🎯 带此反例回做题台调试 →
                </button>
              </>
            ) : result && result.status === "no_fail" ? (
              <div className="vf-stress-success-card">
                <div className="vf-stress-success-head">
                  <span className="vf-stress-success-icon">🎉</span>
                  <div>
                    <strong style={{ fontSize: "14px", color: "var(--ac)" }}>
                      {result.rounds_ran}/{result.rounds_ran} 轮沙箱对拍全量一致！
                    </strong>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)", lineHeight: 1.4 }}>
                      程序在随机规模与极值边界下与暴力标程输出完全吻合。
                    </p>
                  </div>
                </div>
                <div className="vf-stress-success-metrics">
                  <div className="metric">
                    <span className="label">测试轮次</span>
                    <span className="val">{result.rounds_ran} 轮</span>
                  </div>
                  <div className="metric">
                    <span className="label">总耗时</span>
                    <span className="val">{result.time_ms} ms</span>
                  </div>
                  <div className="metric">
                    <span className="label">健壮性评级</span>
                    <span className="val highlight">极高 (Robust)</span>
                  </div>
                </div>
                <Link
                  href={`/problems/${problemId}`}
                  className="btn btn-sm btn-primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: "12px", textDecoration: "none" }}
                >
                  🚀 信心满满，立即前往竞技场提交评测 →
                </Link>
              </div>
            ) : (
              <p className="ghost">拍到不一致会停在这里。暴力超时记 stress_error，不是你的 WA。</p>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  );
}

export default function StressPage() {
  return (
    <Suspense fallback={<Shell><p className="page ghost">对拍台展开中…</p></Shell>}>
      <StressInner />
    </Suspense>
  );
}
