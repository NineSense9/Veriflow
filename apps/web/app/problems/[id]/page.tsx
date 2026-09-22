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
  SubmissionRow,
  SubmitResult,
  api,
} from "@/lib/api";
import { statementProse } from "@/lib/statement-view";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });
const CodeDiffEditor = dynamic(() => import("@/components/CodeDiffEditor"), { ssr: false });

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
  const [drafts, setDrafts] = useState<Record<Lang, string>>({
    python3: PYTHON_STUB,
    cpp17: CPP_STUB,
  });
  const [source, setSource] = useState(PYTHON_STUB);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState("");
  const [debugNotice, setDebugNotice] = useState("");
  const [coach, setCoach] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const [contrast, setContrast] = useState<ContrastResult | null>(null);
  const [contrastBusy, setContrastBusy] = useState(false);
  const [contrastOpen, setContrastOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [historySubmissions, setHistorySubmissions] = useState<SubmissionRow[]>([]);
  const [restoringSubId, setRestoringSubId] = useState<number | null>(null);
  const [restoreNotice, setRestoreNotice] = useState("");
  const [zenHistoryOpen, setZenHistoryOpen] = useState(false);

  function loadHistory() {
    api
      .submissions()
      .then((res) => {
        const list = (res.submissions || []).filter((s) => s.problem_id === id);
        list.sort((a, b) => b.id - a.id);
        setHistorySubmissions(list);
      })
      .catch(() => undefined);
  }

  async function restoreSubmissionCode(subId: number) {
    setRestoringSubId(subId);
    try {
      const detail = await api.submission(subId);
      if (detail.source) {
        const subLang: Lang = detail.lang === "cpp17" ? "cpp17" : "python3";
        setLang(subLang);
        updateSource(detail.source);
        setRestoreNotice(`已成功恢复提交 #${subId} 的 ${detail.lang} 源码！`);
        setTimeout(() => setRestoreNotice(""), 4000);
      }
    } catch {
      setError("拉取历史提交源码失败。");
    } finally {
      setRestoringSubId(null);
    }
  }

  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffSubId, setDiffSubId] = useState<number | null>(null);
  const [diffHistoricalSource, setDiffHistoricalSource] = useState("");
  const [diffSubMeta, setDiffSubMeta] = useState<{ verdict: string; lang: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  async function openDiff(subId: number, verdict: string, subLang: string) {
    setDiffSubId(subId);
    setDiffSubMeta({ verdict, lang: subLang });
    setDiffLoading(true);
    setDiffModalOpen(true);
    try {
      const detail = await api.submission(subId);
      setDiffHistoricalSource(detail.source || "");
    } catch {
      setDiffHistoricalSource("// 拉取该次提交的历史源码失败。");
    } finally {
      setDiffLoading(false);
    }
  }

  function resetCode() {
    const defaultStub = lang === "python3" ? PYTHON_STUB : CPP_STUB;
    if (source === defaultStub) return;
    if (!window.confirm("确定将当前代码重置为初始模板吗？已编写的内容将被覆盖。")) return;
    updateSource(defaultStub);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(source);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  }

  function updateSource(next: string) {
    setSource(next);
    setDrafts((prev) => ({ ...prev, [lang]: next }));
    try {
      sessionStorage.setItem(`vf_code_${id}_${lang}`, next);
      sessionStorage.setItem(`vf_code_${id}`, JSON.stringify({ lang, source: next }));
    } catch {}
  }

  function switchLang(nextLang: Lang) {
    setLang(nextLang);
    let nextSource = drafts[nextLang];
    try {
      const saved = sessionStorage.getItem(`vf_code_${id}_${nextLang}`);
      if (saved) nextSource = saved;
    } catch {}
    setSource(nextSource);
    try {
      sessionStorage.setItem(`vf_code_${id}`, JSON.stringify({ lang: nextLang, source: nextSource }));
    } catch {}
  }

  useEffect(() => {
    api
      .problem(id)
      .then(setProblem)
      .catch(() => setError("题目加载失败。"));

    // Check if user came from /stress with an imported counterexample
    try {
      const debugRaw = sessionStorage.getItem(`vf_debug_case_${id}`);
      if (debugRaw) {
        sessionStorage.removeItem(`vf_debug_case_${id}`);
        const parsed = JSON.parse(debugRaw);
        if (parsed?.counterexample) {
          const parsedLang: Lang = parsed.lang === "cpp17" ? "cpp17" : "python3";
          setLang(parsedLang);
          if (parsed.source) {
            setSource(parsed.source);
            setDrafts((prev) => ({ ...prev, [parsedLang]: parsed.source }));
            try {
              sessionStorage.setItem(`vf_code_${id}_${parsedLang}`, parsed.source);
              sessionStorage.setItem(`vf_code_${id}`, JSON.stringify({ lang: parsedLang, source: parsed.source }));
            } catch {}
          }
          setResult({
            job_id: "",
            submission_id: 0,
            verdict: "WA",
            stage: "done",
            time_ms: 0,
            counterexample: parsed.counterexample,
            sandbox: "docker",
            source: parsed.source || "",
            lang: parsedLang,
          });
          setDebugNotice("🎯 已从智能对拍导入第一条反例与选手程序，请针对反例调整逻辑后重新提交。");
          return;
        }
      }
    } catch {}

    // Restore cached drafts for both languages if available
    try {
      const py = sessionStorage.getItem(`vf_code_${id}_python3`);
      const cpp = sessionStorage.getItem(`vf_code_${id}_cpp17`);
      if (py || cpp) {
        setDrafts((prev) => ({
          python3: py || prev.python3,
          cpp17: cpp || prev.cpp17,
        }));
      }
    } catch {}

    const wanted = Number(new URLSearchParams(window.location.search).get("sub") || "");
    if (Number.isFinite(wanted) && wanted > 0) {
      api
        .submission(wanted)
        .then((row) => {
          if (row.source) {
            setSource(row.source);
            if (row.lang === "cpp17" || row.lang === "python3") {
              setDrafts((prev) => ({ ...prev, [row.lang as Lang]: row.source }));
            }
          }
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
        const sub = data.submission;
        if (sub) {
          setResult(sub);
          if (sub.source) {
            setSource(sub.source);
            if (sub.lang === "cpp17" || sub.lang === "python3") {
              setDrafts((prev) => ({ ...prev, [sub.lang as Lang]: sub.source || "" }));
            }
          }
          if (sub.lang === "cpp17" || sub.lang === "python3") {
            setLang(sub.lang);
          }
        }
        if (data.contrast) setContrast(data.contrast);
      })
      .catch(() => undefined);

    loadHistory();
  }, [id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (diffModalOpen) {
          setDiffModalOpen(false);
        } else if (contrastOpen || submitModalOpen) {
          setContrastOpen(false);
          setSubmitModalOpen(false);
        } else if (zenHistoryOpen) {
          setZenHistoryOpen(false);
        } else if (zenMode) {
          setZenMode(false);
        }
      }
    };
    if (contrastOpen || submitModalOpen || diffModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [contrastOpen, submitModalOpen, zenMode, zenHistoryOpen, diffModalOpen]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!busy) {
          submit();
        }
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [busy, lang, source]);

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
    setSubmitModalOpen(true);
    try {
      const next = await api.submit(id, lang, source);
      setResult(next);
      loadHistory();
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
      <div className={`arena ${zenMode ? "vf-arena-zen" : ""}`}>
        <div className="arena-top">
          {zenMode ? (
            <div className="vf-zen-badge">
              <span>⛶ 专注模式</span>
            </div>
          ) : (
            <Link href="/problems" className="btn btn-ghost btn-sm">
              题库
            </Link>
          )}
          <span className="pid">{problem?.id ?? id}</span>
          <h1>{problem?.title ?? "…"}</h1>
          <div className="arena-tools" style={{ position: "relative" }}>
            <label className="sr-only" htmlFor="lang">
              语言
            </label>
            <select
              id="lang"
              value={lang}
              onChange={(event) => switchLang(event.target.value as Lang)}
            >
              <option value="python3">Python3</option>
              <option value="cpp17">C++17</option>
            </select>
            <button
              type="button"
              title="重置为当前语言初始代码模板"
              onClick={resetCode}
            >
              重置
            </button>
            <button
              type="button"
              title="复制编辑器中的全部源码"
              onClick={copyCode}
            >
              {copiedCode ? "已复制 ✓" : "复制代码"}
            </button>
            {zenMode && historySubmissions.length > 0 ? (
              <button
                type="button"
                className={zenHistoryOpen ? "active" : ""}
                title="查看与恢复历史提交代码"
                onClick={() => setZenHistoryOpen((prev) => !prev)}
              >
                ↺ 历史 ({historySubmissions.length})
              </button>
            ) : null}
            {!zenMode && problem?.has_brute ? (
              <Link
                href={`/stress?id=${id}&lang=${lang}`}
                onClick={() => {
                  try {
                    sessionStorage.setItem(`vf_code_${id}`, JSON.stringify({ lang, source }));
                    sessionStorage.setItem(`vf_code_${id}_${lang}`, source);
                  } catch {}
                }}
              >
                智能对拍
              </Link>
            ) : !zenMode ? (
              <span className="dead" title="本题暂不提供内置暴力解">
                智能对拍
              </span>
            ) : null}
            <button
              type="button"
              disabled={busy}
              title="生成基线参考实现代码"
              onClick={async () => {
                setBusy(true);
                setError("");
                setCoach("");
                try {
                  const next = await api.solve(id, lang);
                  if (next.source) updateSource(next.source);
                  setResult(next);
                } catch (err) {
                  setError((err as Error).message || "生成草稿失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              参考草稿
            </button>
            {!zenMode ? (
              <>
                <button type="button" disabled={!canTutor || contrastBusy} onClick={() => askContrast(false)}>
                  {contrastBusy ? "对照中…" : contrast?.reference_source ? "摊开对照" : "沙箱对照"}
                </button>
                <button type="button" disabled={!canTutor || coachBusy} onClick={askCoach}>
                  {coachBusy ? "启发中…" : "启发教练 (防剧透)"}
                </button>
              </>
            ) : null}
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={submit}
              title="提交评测 (快捷键: Ctrl+Enter / ⌘+Enter)"
            >
              {busy ? "沙箱评测中…" : "提交评测"}
            </button>
            <button
              type="button"
              className={`vf-btn-zen ${zenMode ? "active" : ""}`}
              title={zenMode ? "退出全屏专注模式 (Esc)" : "开启全屏专注沉浸编码模式 (Esc 退出)"}
              onClick={() => {
                setZenMode((prev) => !prev);
                setZenHistoryOpen(false);
              }}
            >
              {zenMode ? "✕ 退出专注" : "⛶ 专注模式"}
            </button>

            {/* Zen Mode History Popover */}
            {zenMode && zenHistoryOpen ? (
              <div className="vf-zen-history-popover">
                <div className="vf-zen-history-head">
                  <strong>提交历史与代码恢复 ({historySubmissions.length})</strong>
                  <button
                    type="button"
                    className="vf-modal-close"
                    style={{ position: "static", transform: "none" }}
                    onClick={() => setZenHistoryOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                {restoreNotice ? (
                  <div className="vf-arena-restore-alert">
                    <span>✓ {restoreNotice}</span>
                  </div>
                ) : null}
                <div className="vf-arena-history-list">
                  {historySubmissions.map((sub) => (
                    <div key={sub.id} className="vf-arena-history-item">
                      <div className="vf-arena-history-meta">
                        <span className={`vf-history-verdict ${sub.verdict === "AC" ? "ac" : sub.verdict === "TLE" ? "tle" : sub.verdict === "CE" ? "ce" : "wa"}`}>
                          {sub.verdict || "PENDING"}
                        </span>
                        <span className="vf-history-id">#{sub.id}</span>
                        <span className="vf-history-lang">{sub.lang}</span>
                        {sub.time_ms != null ? <span className="vf-history-time">{sub.time_ms} ms</span> : null}
                      </div>
                      <div className="vf-arena-history-actions">
                        <button
                          type="button"
                          className="vf-history-btn-restore"
                          disabled={restoringSubId === sub.id}
                          onClick={() => restoreSubmissionCode(sub.id)}
                          title="恢复该次提交的代码至编辑器"
                        >
                          {restoringSubId === sub.id ? "载入中…" : "↺ 载入代码"}
                        </button>
                        <button
                          type="button"
                          className="vf-history-btn-diff"
                          onClick={() => openDiff(sub.id, sub.verdict || "UNKNOWN", sub.lang)}
                          title="对比当前编辑器代码与此版本的差异"
                        >
                          ⇄ 对比
                        </button>
                        <Link
                          href={`/status/${sub.id}`}
                          className="vf-history-btn-detail"
                          target="_blank"
                          title="在新标签页查看提交详情"
                        >
                          详情 ↗
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {debugNotice ? (
          <div className="vf-arena-debug-notice">
            <span>{debugNotice}</span>
            <button type="button" onClick={() => setDebugNotice("")} aria-label="关闭提示">✕</button>
          </div>
        ) : null}
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
            <CodeEditor
              language={monacoLang}
              value={source}
              onChange={updateSource}
              onSubmit={submit}
            />
            <div className="vf-editor-bar-hint">
              <span>💡 支持 <code>Ctrl+Enter</code> 或 <code>⌘+Enter</code> 快捷提交评测</span>
            </div>
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

            <h2>提交历史 {historySubmissions.length ? `(${historySubmissions.length})` : ""}</h2>
            {restoreNotice ? (
              <div className="vf-arena-restore-alert">
                <span>✓ {restoreNotice}</span>
              </div>
            ) : null}
            {historySubmissions.length === 0 ? (
              <p className="ghost">本题暂无提交记录。提交后将在此记录版本并支持一键恢复历史代码。</p>
            ) : (
              <div className="vf-arena-history-list">
                {historySubmissions.slice(0, 8).map((sub) => (
                  <div key={sub.id} className="vf-arena-history-item">
                    <div className="vf-arena-history-meta">
                      <span className={`vf-history-verdict ${sub.verdict === "AC" ? "ac" : sub.verdict === "TLE" ? "tle" : sub.verdict === "CE" ? "ce" : "wa"}`}>
                        {sub.verdict || "PENDING"}
                      </span>
                      <span className="vf-history-id">#{sub.id}</span>
                      <span className="vf-history-lang">{sub.lang}</span>
                      {sub.time_ms != null ? <span className="vf-history-time">{sub.time_ms} ms</span> : null}
                    </div>
                    <div className="vf-arena-history-actions">
                      <button
                        type="button"
                        className="vf-history-btn-restore"
                        disabled={restoringSubId === sub.id}
                        onClick={() => restoreSubmissionCode(sub.id)}
                        title="将该次提交的代码重新载入到编辑器"
                      >
                        {restoringSubId === sub.id ? "载入中…" : "↺ 载入代码"}
                      </button>
                      <button
                        type="button"
                        className="vf-history-btn-diff"
                        onClick={() => openDiff(sub.id, sub.verdict || "UNKNOWN", sub.lang)}
                        title="对比当前编辑器代码与此版本的差异"
                      >
                        ⇄ 对比
                      </button>
                      <Link
                        href={`/status/${sub.id}`}
                        className="vf-history-btn-detail"
                        title="查看完整评测详情"
                      >
                        详情 →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <h2>最小反例</h2>
            {result?.counterexample ? (
              <>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--error)", background: "var(--wa-soft)", padding: "2px 8px", borderRadius: "4px", marginBottom: "8px" }}>
                  <span>⚠️ 沙箱捕获错误边界 · 提取最小反例</span>
                </div>
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
              <p className="ghost">提交后若 WA/RE，沙箱将自动抓取挂掉的最短测试用例，在此三列（输入/期望/实际）并排呈现。</p>
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
                  ? contrast?.note || "点顶栏「沙箱对照」：先用沙箱验证一份能过这组反例的代码，再并排看差异。"
                  : "提交产生带反例的未通过记录后即可对照。"}
              </p>
            )}
            <h2>启发教练</h2>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 8px", borderRadius: "4px", marginBottom: "8px" }}>
              <span>🛡️ 苏格拉底启发 · 严禁直接给出代码</span>
            </div>
            {coach ? (
              <div style={{ padding: "10px 12px", background: "var(--surface-2)", borderRadius: "6px", borderLeft: "3px solid var(--accent)", margin: "4px 0 8px" }}>
                <p className="note" style={{ margin: 0, fontWeight: 500 }}>{coach}</p>
              </div>
            ) : (
              <p className="ghost">
                {canTutor ? "已自动捕获最小反例！点击顶栏「启发教练」，AI 将针对反例进行追问，引导你自主纠错。" : "当提交遇到 WA 且提取出最小反例后，可在此开启引导式启发思考。"}
              </p>
            )}
            {error ? <p className="err" role="alert">{error}</p> : null}
          </aside>
        </div>
        <div className="verdict-bar" aria-live="polite">
          <span
            className={`verdict ${result?.verdict ?? (busy ? "running" : "")}`}
            style={{ cursor: "pointer" }}
            title="点击展开评测弹窗详情"
            onClick={() => setSubmitModalOpen(true)}
          >
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
      {submitModalOpen ? (
        <div
          className="vf-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vf-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSubmitModalOpen(false);
          }}
        >
          <div className="vf-modal-card">
            <header className="vf-modal-header">
              <h3 id="vf-modal-title">
                {busy ? "Docker 沙箱裁判 · 评测中" : `沙箱评测详情 · ${problem?.id ?? ""}`}
              </h3>
              <button
                type="button"
                className="vf-modal-close"
                aria-label="关闭弹窗"
                onClick={() => setSubmitModalOpen(false)}
              >
                ✕
              </button>
            </header>

            <div className="vf-modal-body">
              {/* Progress Bar */}
              <div className="vf-modal-progress-wrap">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)" }}>
                  <span>
                    {busy
                      ? "正在隔离沙箱中编译并执行测试点…"
                      : result?.verdict === "AC"
                      ? "全部测试点通过 (100%)"
                      : `评测完成 (${result?.verdict ?? ""})`}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {busy ? "评测中…" : "100%"}
                  </span>
                </div>
                <div className="vf-modal-progress-bar">
                  <div
                    className={`vf-modal-progress-fill ${
                      busy
                        ? "running"
                        : result?.verdict === "AC"
                        ? "ok"
                        : result?.verdict === "TLE"
                        ? "warn"
                        : "bad"
                    }`}
                  />
                </div>
              </div>

              {/* Judging state vs Verdict state */}
              {busy ? (
                <div style={{ padding: "16px 0", textAlign: "center" }}>
                  <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 500 }}>
                    安全沙箱正在运行，测试点高频校验中…
                  </p>
                  <p className="caption" style={{ margin: 0 }}>
                    Docker 裁判环境：C++17 (g++ -O2) / Python3 · 毫秒级防挂保护
                  </p>
                </div>
              ) : result ? (
                <>
                  {/* Verdict Banner */}
                  <div
                    className={`vf-modal-verdict-banner ${
                      result.verdict === "AC"
                        ? "ac"
                        : result.verdict === "TLE"
                        ? "tle"
                        : result.verdict === "CE"
                        ? "ce"
                        : "wa"
                    }`}
                  >
                    <div
                      className={`vf-modal-verdict-title ${
                        result.verdict === "AC"
                          ? "ac"
                          : result.verdict === "TLE"
                          ? "tle"
                          : result.verdict === "CE"
                          ? "ce"
                          : "wa"
                      }`}
                    >
                      {result.verdict === "AC" && <span>🎉 Accepted · 全部通过</span>}
                      {result.verdict === "WA" && <span>❌ Wrong Answer · 答案错误</span>}
                      {result.verdict === "TLE" && <span>⏳ Time Limit Exceeded · 运行超时</span>}
                      {result.verdict === "CE" && <span>⚠️ Compile Error · 编译错误</span>}
                      {result.verdict === "RE" && <span>💥 Runtime Error · 运行时异常</span>}
                      {!["AC", "WA", "TLE", "CE", "RE"].includes(result.verdict) && (
                        <span>{result.verdict}</span>
                      )}
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>
                      {result.time_ms != null ? `${result.time_ms} ms` : ""}
                    </span>
                  </div>

                  {/* Performance stats */}
                  <div className="vf-modal-stats">
                    <div className="vf-modal-stat-item">
                      <div className="vf-modal-stat-label">运行耗时</div>
                      <div className="vf-modal-stat-value">{result.time_ms ?? 0} ms</div>
                    </div>
                    <div className="vf-modal-stat-item">
                      <div className="vf-modal-stat-label">评测语言</div>
                      <div className="vf-modal-stat-value">{result.lang || lang}</div>
                    </div>
                    <div className="vf-modal-stat-item">
                      <div className="vf-modal-stat-label">裁判沙箱</div>
                      <div className="vf-modal-stat-value" style={{ fontSize: "12px" }}>
                        {result.sandbox || "Docker"}
                      </div>
                    </div>
                  </div>

                  {/* Counterexample if WA */}
                  {result.counterexample ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <strong style={{ fontSize: "13px" }}>沙箱捕获失败测试用例 (最小反例)</strong>
                        <CopyButton
                          text={`输入:\n${result.counterexample.stdin}\n期望:\n${result.counterexample.expected}\n实际:\n${result.counterexample.actual}`}
                          label="复制反例"
                        />
                      </div>
                      <div className="vf-modal-counter-wrap">
                        <div className="vf-modal-counter-box">
                          <div className="vf-modal-counter-label">输入 (stdin)</div>
                          <pre>{result.counterexample.stdin}</pre>
                        </div>
                        <div className="vf-modal-counter-box">
                          <div className="vf-modal-counter-label">期望输出 (expected)</div>
                          <pre>{result.counterexample.expected}</pre>
                        </div>
                        <div className="vf-modal-counter-box actual">
                          <div className="vf-modal-counter-label" style={{ color: "var(--wa)" }}>实际输出 (actual)</div>
                          <pre>{result.counterexample.actual}</pre>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {result.verdict === "AC" ? (
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
                      恭喜！你的解法已顺利通过该题目的全部公开用例与隐藏评测点。
                    </p>
                  ) : null}
                </>
              ) : error ? (
                <div className="err" role="alert" style={{ margin: 0 }}>
                  {error}
                </div>
              ) : null}
            </div>

            <footer className="vf-modal-actions">
              {result?.verdict === "AC" ? (
                <>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setSubmitModalOpen(false)}
                  >
                    继续做题
                  </button>
                  {result.submission_id ? (
                    <Link className="btn" href={`/status/${result.submission_id}`}>
                      查看提交详情 →
                    </Link>
                  ) : null}
                </>
              ) : (
                <>
                  {canTutor ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={coachBusy}
                      onClick={() => {
                        setSubmitModalOpen(false);
                        askCoach();
                      }}
                    >
                      {coachBusy ? "启发中…" : "🤖 苏格拉底启发教练"}
                    </button>
                  ) : null}
                  {problem?.has_brute ? (
                    <Link
                      className="btn"
                      href={`/stress?id=${id}&lang=${lang}`}
                      onClick={() => {
                        try {
                          sessionStorage.setItem(`vf_code_${id}`, JSON.stringify({ lang, source }));
                        } catch {}
                      }}
                    >
                      ⚡ 智能对拍找反例
                    </Link>
                  ) : null}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setSubmitModalOpen(false)}
                  >
                    关闭继续调试
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      ) : null}

      {/* Code Diff Inspector Modal */}
      {diffModalOpen ? (
        <div
          className="vf-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vf-diff-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDiffModalOpen(false);
          }}
        >
          <div className="vf-modal-card vf-diff-dialog">
            <header className="vf-modal-header">
              <div>
                <span className="kicker">版本差异检查器 (Code Diff)</span>
                <h3 id="vf-diff-title" style={{ margin: "2px 0 0" }}>
                  提交 #{diffSubId} ({diffSubMeta?.verdict} · {diffSubMeta?.lang}) ⇄ 当前编辑器代码
                </h3>
              </div>
              <button
                type="button"
                className="vf-modal-close"
                onClick={() => setDiffModalOpen(false)}
                aria-label="关闭对比"
              >
                ✕
              </button>
            </header>

            <div className="vf-diff-body">
              {diffLoading ? (
                <div className="vf-diff-loading">正在拉取提交 #{diffSubId} 历史源码…</div>
              ) : (
                <CodeDiffEditor
                  original={diffHistoricalSource}
                  modified={source}
                  language={monacoLang}
                />
              )}
            </div>

            <footer className="vf-modal-actions" style={{ justifyContent: "space-between" }}>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                <span>左栏：历史提交 #{diffSubId}</span>
                <span style={{ margin: "0 8px" }}>·</span>
                <span>右栏：当前编辑器代码 (增减差异实时高亮)</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    if (diffSubId) restoreSubmissionCode(diffSubId);
                    setDiffModalOpen(false);
                  }}
                >
                  ↺ 恢复为此历史版本
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setDiffModalOpen(false)}
                >
                  关闭 (Esc)
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
