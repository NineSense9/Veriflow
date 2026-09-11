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
  const [problems, setProblems] = useState<ProblemListItem[]>([]);
  const [problemId, setProblemId] = useState(initialId);
  const [kit, setKit] = useState<StressKit | null>(null);
  const [gen, setGen] = useState("");
  const [brute, setBrute] = useState("");
  const [sol, setSol] = useState(PYTHON_STUB);
  const [genLang, setGenLang] = useState<Lang>("python3");
  const [bruteLang, setBruteLang] = useState<Lang>("python3");
  const [solLang, setSolLang] = useState<Lang>("python3");
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
        <div className="arena-top">
          <span className="pid">STRESS</span>
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
        {disabled ? (
          <p className="ghost" style={{ padding: 16 }}>
            本题不提供暴力解，对拍按钮禁用。
          </p>
        ) : null}
        <div className="stress-cols">
          <div className="stress-col">
            <h2>
              生成器
              <select aria-label="生成器语言" value={genLang} onChange={(e) => setGenLang(e.target.value as Lang)}>
                <option value="python3">Python3</option>
                <option value="cpp17">C++17</option>
              </select>
            </h2>
            <CodeEditor language={genLang === "cpp17" ? "cpp" : "python"} value={gen} onChange={setGen} />
          </div>
          <div className="stress-col">
            <h2>
              暴力解
              <select aria-label="暴力解语言" value={bruteLang} onChange={(e) => setBruteLang(e.target.value as Lang)}>
                <option value="python3">Python3</option>
                <option value="cpp17">C++17</option>
              </select>
            </h2>
            <CodeEditor language={bruteLang === "cpp17" ? "cpp" : "python"} value={brute} onChange={setBrute} />
          </div>
          <div className="stress-col">
            <h2>
              选手程序
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
