"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Statement from "@/components/Statement";
import {
  CPP_STUB,
  PYTHON_STUB,
  ProblemDetail,
  SubmitResult,
  api,
} from "@/lib/api";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });

type Lang = "python3" | "cpp17";

export default function ProblemPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [lang, setLang] = useState<Lang>("python3");
  const [source, setSource] = useState(PYTHON_STUB);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .problem(id)
      .then(setProblem)
      .catch(() => setError("题目加载失败。"));
  }, [id]);

  const monacoLang = lang === "python3" ? "python" : "cpp";
  const stages = useMemo(() => {
    if (!result && !busy) return [];
    if (busy) return ["compiling"];
    if (result?.verdict === "CE") return ["compiling"];
    if (result?.stage === "running_public") return ["compiling", "samples"];
    if (result?.stage === "running_hidden") return ["compiling", "samples", "hidden"];
    return ["compiling", "samples", "hidden"];
  }, [busy, result]);

  function stageClass(name: string) {
    if (!result && busy && name === "compiling") return "on";
    if (!result) return "";
    if (result.verdict === "CE" && name === "compiling") return "stop";
    if (result.stage === "running_public" && name === "samples") return "stop";
    if (result.stage === "running_hidden" && name === "hidden") return "stop";
    if (result.verdict === "AC") return "ok";
    if (stages.includes(name) && name !== stages[stages.length - 1]) return "ok";
    if (stages[stages.length - 1] === name && result.verdict !== "AC") return "stop";
    return "";
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const next = await api.submit(id, lang, source);
      setResult(next);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 401 ? "登录已过期，请重新入场。" : "提交失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="arena">
        <div className="arena-top">
          <Link href="/problems">题库</Link>
          <span className="pid">{problem?.id ?? id}</span>
          <h1>{problem?.title ?? "…"}</h1>
          <select
            value={lang}
            onChange={(event) => {
              const next = event.target.value as Lang;
              setLang(next);
              setSource(next === "python3" ? PYTHON_STUB : CPP_STUB);
            }}
          >
            <option value="python3">Python3</option>
            <option value="cpp17">C++17</option>
          </select>
          {problem?.has_brute ? (
            <Link href={`/stress?id=${id}`}>对拍</Link>
          ) : (
            <span className="dead" title="本题不提供暴力解">
              对拍
            </span>
          )}
          <button className="primary" type="button" disabled={busy} onClick={submit}>
            {busy ? "判定中" : "提交"}
          </button>
        </div>
        <div className="arena-body">
          <section className="statement">
            {problem ? <Statement source={problem.statement} /> : <p>试卷展开中…</p>}
            {problem ? (
              <p>
                {problem.spec.time_limit_ms} ms / {problem.spec.memory_limit_mb} MB
              </p>
            ) : null}
          </section>
          <section className="editor-pane">
            <CodeEditor language={monacoLang} value={source} onChange={setSource} />
          </section>
          <aside className="side">
            <h2>公开样例</h2>
            {problem?.public_tests.map((test) => (
              <div className="sample" key={test.name}>
                <div>#{test.name} in</div>
                {test.stdin}
                <div>out</div>
                {test.stdout}
              </div>
            ))}
            <h2>最小反例</h2>
            {result?.counterexample ? (
              <div className="diff">
                <div>
                  <strong>输入</strong>
                  {"\n"}
                  {result.counterexample.stdin}
                </div>
                <div>
                  <strong>期望</strong>
                  {"\n"}
                  {result.counterexample.expected}
                </div>
                <div className="fail">
                  <strong>实际</strong>
                  {"\n"}
                  {result.counterexample.actual}
                </div>
              </div>
            ) : (
              <p className="ghost">提交后若 WA，三列会停在这里。教练和对拍下一期再挂。</p>
            )}
            {error ? <p className="ghost">{error}</p> : null}
          </aside>
        </div>
        <div className="verdict-bar">
          <span className={`verdict ${result?.verdict ?? (busy ? "running" : "")}`}>
            {busy ? "RUN" : result?.verdict ?? "IDLE"}
          </span>
          <div className="stages">
            <span className={stageClass("compiling")}>编译</span>
            <span className={stageClass("samples")}>样例</span>
            <span className={stageClass("hidden")}>隐藏</span>
          </div>
          <span>{result ? `${result.time_ms} ms · ${result.sandbox}` : "等待提交"}</span>
        </div>
      </div>
    </Shell>
  );
}
