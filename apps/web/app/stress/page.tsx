"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
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
            <label>
              轮次
              <input
                type="number"
                min={1}
                max={200}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                aria-label="对拍轮次"
                style={{ width: 72, marginLeft: 8 }}
              />
            </label>
            <button className="primary" type="button" disabled={busy || disabled} data-click-fx="strong" onClick={run}>
              {busy ? "对拍中" : "开拍"}
            </button>
          </div>
          <div className="stress-banner">
            <span className="stress-banner-tag">对拍机制</span>
            <span>已加载该题预置测资生成器与暴力标程，点击「开拍」即在沙箱中高频对比 50~200 轮，毫秒级捕获边界反例。</span>
          </div>
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
            {busy ? <div>循环中…</div> : null}
            {result ? (
              <div>
                <span className={`verdict ${result.status === "mismatch" ? "WA" : result.status === "no_fail" ? "AC" : "TLE"}`}>
                  {result.status}
                </span>
                {"  "}
                {result.rounds_ran} 轮 · {result.time_ms} ms · {result.sandbox}
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
              </>
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
