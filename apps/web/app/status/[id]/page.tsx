"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import CopyButton from "@/components/CopyButton";
import { SubmissionDetail, api } from "@/lib/api";

export default function SubmissionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [row, setRow] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState("");

  function jumpToStress() {
    if (!row) return;
    try {
      sessionStorage.setItem(
        `vf_code_${row.problem_id}`,
        JSON.stringify({ lang: row.lang, source: row.source || "" })
      );
      if (row.source) {
        sessionStorage.setItem(`vf_code_${row.problem_id}_${row.lang}`, row.source);
      }
      if (row.counterexample) {
        sessionStorage.setItem(
          `vf_stress_seed_${row.problem_id}`,
          JSON.stringify({
            subId: row.id,
            counterexample: row.counterexample,
            source: row.source,
            lang: row.lang,
          })
        );
      }
    } catch {}
    router.push(`/stress?id=${row.problem_id}&lang=${row.lang}`);
  }

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError("评测编号格式无效。");
      return;
    }
    api
      .submission(id)
      .then(setRow)
      .catch(() => setError("未找到该条评测记录，或当前用户无权访问。"));
  }, [id]);

  return (
    <Shell>
      <main className="page wide">
        <p className="vf-home-more" style={{ marginTop: 0 }}>
          <Link href="/account">个人中心</Link>
          <Link href="/status">沙箱判题记录</Link>
        </p>
        {error ? <p className="err" role="alert">{error}</p> : null}
        {!row && !error ? <p className="ghost">正在读取沙箱评测数据…</p> : null}
        {row ? (
          <>
            <header className="page-head">
              <p className="kicker">沙箱评测详情 · #{row.id}</p>
              <h1>
                <Link href={`/problems/${row.problem_id}`}>{row.problem_id}</Link>
              </h1>
              <p className="lead">
                <span className={`verdict ${row.verdict ?? ""}`}>{row.verdict ?? "—"}</span>
                {" · "}
                {row.lang}
                {row.time_ms != null ? ` · ${row.time_ms} ms` : ""}
                {" · "}
                {row.created_at.replace("T", " ").slice(0, 19)}
              </p>
            </header>
            <div className="sample-head" style={{ marginBottom: 8 }}>
              <span>提交源码回溯</span>
              <span className="vf-home-more" style={{ margin: 0 }}>
                <CopyButton text={row.source || ""} label="复制代码" />
                <Link href={`/problems/${row.problem_id}?sub=${row.id}`}>载入编辑器重试</Link>
                <button
                  type="button"
                  className="vf-status-stress-link-btn"
                  onClick={jumpToStress}
                  title="携带此代码与反例前往智能对拍页面验证"
                >
                  ⚡ 前往对拍
                </button>
              </span>
            </div>
            {row.source ? (
              <pre className="vf-account-source">{row.source}</pre>
            ) : (
              <p className="ghost">此评测记录未持久化源码。</p>
            )}
            {row.counterexample ? (
              <section className="vf-status-ce-section">
                <div className="vf-status-ce-head">
                  <h2>
                    <span>沙箱捕获失败测试用例 (最小反例)</span>
                  </h2>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="vf-status-ce-jump-stress"
                      onClick={jumpToStress}
                      title="携此失败反例与提交代码前往智能对拍平台进行边界比对"
                    >
                      ⚡ 携此反例与代码前往智能对拍 →
                    </button>
                    <CopyButton
                      text={`输入:\n${row.counterexample.stdin}\n期望:\n${row.counterexample.expected}\n实际:\n${row.counterexample.actual}`}
                      label="复制反例"
                    />
                  </div>
                </div>
                <div className="vf-status-ce-grid">
                  <div className="vf-status-ce-col">
                    <span className="vf-status-ce-label">输入测试数据 (stdin)</span>
                    <pre className="vf-status-ce-pre">{row.counterexample.stdin || "(空)"}</pre>
                  </div>
                  <div className="vf-status-ce-col">
                    <span className="vf-status-ce-label">期望标准输出 (expected)</span>
                    <pre className="vf-status-ce-pre">{row.counterexample.expected || "(空)"}</pre>
                  </div>
                  <div className="vf-status-ce-col actual">
                    <span className="vf-status-ce-label err">实际程序输出 (actual)</span>
                    <pre className="vf-status-ce-pre">{row.counterexample.actual || "(空)"}</pre>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </Shell>
  );
}
