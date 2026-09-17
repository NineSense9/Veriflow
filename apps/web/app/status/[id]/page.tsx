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
      setError("编号不对。");
      return;
    }
    api
      .submission(id)
      .then(setRow)
      .catch(() => setError("没有这条提交，或不是你的。"));
  }, [id]);

  return (
    <Shell>
      <main className="page wide">
        <p className="vf-home-more" style={{ marginTop: 0 }}>
          <Link href="/account">个人中心</Link>
          <Link href="/status">提交记录</Link>
        </p>
        {error ? <p className="err" role="alert">{error}</p> : null}
        {!row && !error ? <p className="ghost">正在读取代码…</p> : null}
        {row ? (
          <>
            <header className="page-head">
              <p className="kicker">提交 #{row.id}</p>
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
              <span>当时提交的代码</span>
              <span className="vf-home-more" style={{ margin: 0 }}>
                <CopyButton text={row.source || ""} label="复制代码" />
                <Link href={`/problems/${row.problem_id}?sub=${row.id}`}>载入编辑器</Link>
              </span>
            </div>
            {row.source ? (
              <pre className="vf-account-source">{row.source}</pre>
            ) : (
              <p className="ghost">这条记录没有存下源码。</p>
            )}
            {row.counterexample ? (
              <section>
                <h2>反例</h2>
                <p className="caption">输入</p>
                <pre className="vf-account-source">{row.counterexample.stdin}</pre>
                <p className="caption">期望</p>
                <pre className="vf-account-source">{row.counterexample.expected}</pre>
                <p className="caption">你的输出</p>
                <pre className="vf-account-source">{row.counterexample.actual}</pre>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </Shell>
  );
}
