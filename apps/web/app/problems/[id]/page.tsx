"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import Statement from "@/components/Statement";
import CopyButton from "@/components/CopyButton";
import {
  CPP_STUB,
  PYTHON_STUB,
  ContrastResult,
  ProblemDetail,
  PublicTest,
  SubmitResult,
  api,
} from "@/lib/api";
import { statementProse } from "@/lib/statement-view";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });

type Lang = "python3" | "cpp17";

function SamplePanel({ tests }: { tests: PublicTest[] }) {
  return (
    <div className="statement-samples">
      <h2>输入输出样例</h2>
      {tests.length === 0 ? <p className="ghost">本题暂无公开样例</p> : null}
      {tests.map((test, index) => (
        <div className="statement-sample" key={test.name}>
          <div className="sample-head">
            <span>样例 {index + 1}</span>
            <CopyButton text={`${test.stdin}\n${test.stdout}`} label={`复制样例 ${test.name}`} />
          </div>
          <p className="io-label">输入</p>
          <pre>{test.stdin}</pre>
          <p className="io-label">输出</p>
          <pre>{test.stdout}</pre>
        </div>
      ))}
    </div>
  );
}

export default function ProblemPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [lang, setLang] = useState<Lang>("python3");
  const [source, setSource] = useState(PYTHON_STUB);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");
  const [coach, setCoach] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const [contrast, setContrast] = useState<ContrastResult | null>(null);
  const [contrastBusy, setContrastBusy] = useState(false);
  const [contrastOpen, setContrastOpen] = useState(false);

  useEffect(() => {
    api
      .problem(id)
      .then(setProblem)
      .catch(() => setError("题目加载失败。"));
    const wanted = Number(new URLSearchParams(window.location.search).get("sub") || "");
    if (Number.isFinite(wanted) && wanted > 0) {
      api
        .submission(wanted)
        .then((row) => {
          if (row.source) setSource(row.source);
          if (row.lang === "cpp17" || row.lang === "python3") setLang(row.lang);
          setResult({
            job_id: "",
            submission_id: row.id,
            verdict: row.verdict || "",
            stage: "done",
            time_ms: row.time_ms || 0,
            counterexample: row.counterexample,
            sandbox: "",
            source: row.source,
            lang: row.lang,
          });
        })
        .catch(() => undefined);
      return;
    }
    api
      .review(id)
      .then((data) => {
        if (data.submission) {
          setResult(data.submission);
          if (data.submission.source) setSource(data.submission.source);
          if (data.submission.lang === "cpp17" || data.submission.lang === "python3") {
            setLang(data.submission.lang);
          }
        }
        if (data.contrast) setContrast(data.contrast);
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!contrastOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContrastOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [contrastOpen]);

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
    setCoach("");
    setContrast(null);
    setContrastOpen(false);
    try {
      const next = await api.submit(id, lang, source);
      setResult(next);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 401 ? "登录已过期，请重新登录。" : "提交失败。");
    } finally {
      setBusy(false);
    }
  }

  const canTutor =
    Boolean(result?.counterexample) && (result?.verdict === "WA" || result?.verdict === "RE");

  async function askCoach() {
    if (!result?.submission_id) return;
    setCoachBusy(true);
    setError("");
    try {
      const next = await api.tutor(id, result.submission_id);
      setCoach(next.question);
    } catch (err) {
      setError((err as Error).message || "教练暂时不在。");
    } finally {
      setCoachBusy(false);
    }
  }

  async function askContrast(force = false) {
    if (!result?.submission_id) return;
    if (!force && contrast?.reference_source) {
      setContrastOpen(true);
      return;
    }
    setContrastBusy(true);
    setError("");
    try {
      const next = await api.contrast(id, result.submission_id);
      setContrast(next);
      if (next.reference_source) setContrastOpen(true);
    } catch (err) {
      setError((err as Error).message || "对照失败。");
    } finally {
      setContrastBusy(false);
    }
  }

  return (
    <Shell>
      <div className="arena">
        <div className="arena-top">
          <Link href="/problems" className="btn btn-ghost btn-sm">
            题库
          </Link>
          <span className="pid">{problem?.id ?? id}</span>
          <h1>{problem?.title ?? "…"}</h1>
          <div className="arena-tools">
            <label className="sr-only" htmlFor="lang">
              语言
            </label>
            <select
              id="lang"
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
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setCoach("");
                try {
                  const next = await api.solve(id, lang);
                  if (next.source) setSource(next.source);
                  setResult(next);
                } catch (err) {
                  setError((err as Error).message || "起草失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              起草
            </button>
            <button type="button" disabled={!canTutor || contrastBusy} onClick={() => askContrast(false)}>
              {contrastBusy ? "对照中" : contrast?.reference_source ? "摊开对照" : "对照"}
            </button>
            <button type="button" disabled={!canTutor || coachBusy} onClick={askCoach}>
              {coachBusy ? "追问中" : "教练"}
            </button>
            <button className="primary" type="button" disabled={busy} onClick={submit}>
              {busy ? "判定中" : "提交"}
            </button>
          </div>
        </div>
        <div className="arena-body">
          <section className="statement">
            {problem ? (
              <Statement
                source={
                  problem.public_tests.length
                    ? statementProse(problem.statement)
                    : problem.statement
                }
              />
            ) : (
              <p className="ghost">题目加载中…</p>
            )}
            {problem ? <SamplePanel tests={problem.public_tests} /> : null}
            {problem ? (
              <p className="limits">
                {problem.spec.time_limit_ms} ms / {problem.spec.memory_limit_mb} MB
              </p>
            ) : null}
          </section>
          <section className="editor-pane">
            <CodeEditor language={monacoLang} value={source} onChange={setSource} />
          </section>
          <aside className="side">
            <h2>公开样例</h2>
            {problem && problem.public_tests.length === 0 ? (
              <p className="ghost">本题暂无公开样例</p>
            ) : null}
            {problem?.public_tests.map((test) => (
              <div className="sample" key={test.name}>
                <div className="sample-head">
                  <span>#{test.name}</span>
                  <CopyButton
                    text={`${test.stdin}\n${test.stdout}`}
                    label={`复制样例 ${test.name}`}
                  />
                </div>
                <div>输入</div>
                {test.stdin}
                <div>输出</div>
                {test.stdout}
              </div>
            ))}
            <h2>最小反例</h2>
            {result?.counterexample ? (
              <>
                <div className="sample-head">
                  <span>{result.verdict} · 第一条反例</span>
                  <CopyButton
                    text={`stdin\n${result.counterexample.stdin}\nexpected\n${result.counterexample.expected}\nactual\n${result.counterexample.actual}`}
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
              </>
            ) : (
              <p className="ghost">提交后若 WA，三列会停在这里。有反例才能请教。</p>
            )}
            <h2>对照</h2>
            {contrast?.reference_source ? (
              <>
                <p className="ghost">{contrast.note}</p>
                <div className="sample-head">
                  <button className="btn btn-sm" type="button" onClick={() => setContrastOpen(true)}>
                    摊开对照
                  </button>
                  <button className="btn btn-sm" type="button" disabled={contrastBusy} onClick={() => askContrast(true)}>
                    {contrastBusy ? "对照中" : "重新对照"}
                  </button>
                </div>
                {contrast.guess ? (
                  <p className="note">AI 差异分析建议：{contrast.guess}</p>
                ) : (
                  <p className="ghost">对照基准由隔离沙箱真实运行生成，确保评测客观准确。</p>
                )}
              </>
            ) : (
              <p className="ghost">
                {canTutor
                  ? contrast?.note || "点顶栏「对照」：先用沙箱验证一份能过这组反例的代码，再并排看差异。"
                  : "先交一发带反例的 WA。"}
              </p>
            )}
            <h2>教练</h2>
            {coach ? (
              <p className="note">{coach}</p>
            ) : (
              <p className="ghost">
                {canTutor ? "只问不讲。点顶栏「教练」。" : "先交一发失败的。"}
              </p>
            )}
            {error ? <p className="err" role="alert">{error}</p> : null}
          </aside>
        </div>
        <div className="verdict-bar" aria-live="polite">
          <span className={`verdict ${result?.verdict ?? (busy ? "running" : "")}`}>
            {busy ? "RUN" : result?.verdict ?? "IDLE"}
          </span>
          <div className="stages">
            <span className={stageClass("compiling")}>编译</span>
            <span className={stageClass("samples")}>样例</span>
            <span className={stageClass("hidden")}>隐藏</span>
          </div>
          <span className="verdict-meta">
            {busy ? "判定中" : result ? `${result.time_ms} ms · ${result.sandbox}` : "尚未提交"}
            {result?.submission_id ? (
              <>
                {" · "}
                <Link href={`/status/${result.submission_id}`}>看这次代码</Link>
              </>
            ) : null}
          </span>
        </div>
      </div>
      {contrastOpen && contrast?.reference_source ? (
        <div className="contrast-stage" role="dialog" aria-modal="true" aria-labelledby="contrast-stage-title">
          <header className="contrast-stage-bar">
            <div>
              <p className="kicker">对照</p>
              <h2 id="contrast-stage-title">
                {problem?.id} {problem?.title}
              </h2>
            </div>
            <button className="btn" type="button" onClick={() => setContrastOpen(false)}>
              退出对照
            </button>
          </header>
          <div className="contrast-stage-code">
            <section>
              <h3>你的代码</h3>
              <pre>{contrast.user_source}</pre>
            </section>
            <section>
              <h3>{contrast.solver === "brute" ? "暴力解（已过这组反例）" : "近邻代码（已过这组反例）"}</h3>
              <pre>{contrast.reference_source}</pre>
            </section>
          </div>
          <footer className="contrast-stage-note">
            <p className="ghost">{contrast.note}</p>
            {contrast.guess ? (
              <p>
                <strong>差异分析建议</strong>
                {contrast.guess}
              </p>
            ) : (
              <p>对照基准由隔离沙箱真实运行生成，确保评测客观准确。</p>
            )}
            {result?.counterexample ? (
              <p className="ghost">
                这组反例 输入 {result.counterexample.stdin.replace(/\s+/g, " ").trim()} · 期望{" "}
                {result.counterexample.expected.trim()} · 你的输出 {result.counterexample.actual.trim()}
              </p>
            ) : null}
          </footer>
        </div>
      ) : null}
    </Shell>
  );
}
