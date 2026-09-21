"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/Shell";
import CopyButton from "@/components/CopyButton";
import { SubmissionDetail, api } from "@/lib/api";

export default function SubmissionPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [row, setRow] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState("");

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
              </span>
            </div>
            {row.source ? (
              <pre className="vf-account-source">{row.source}</pre>
            ) : (
              <p className="ghost">此评测记录未持久化源码。</p>
            )}
            {row.counterexample ? (
              <section style={{ marginTop: 24 }}>
                <h2>沙箱捕获失败测试用例 (最小反例)</h2>
                <p className="caption">输入测试数据 (stdin)</p>
                <pre className="vf-account-source">{row.counterexample.stdin}</pre>
                <p className="caption">期望标准输出 (expected)</p>
                <pre className="vf-account-source">{row.counterexample.expected}</pre>
                <p className="caption">实际程序输出 (actual)</p>
                <pre className="vf-account-source">{row.counterexample.actual}</pre>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </Shell>
  );
}
