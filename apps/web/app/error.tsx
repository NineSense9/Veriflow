"use client";

import Brand from "@/components/Brand";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page">
      <Brand />
      <header className="page-head">
        <h1>页面出错</h1>
        <p className="lead">{error.message || "渲染失败。可以重试，不会丢掉已保存的验证 run。"}</p>
      </header>
      {error.digest ? <p className="caption">id {error.digest}</p> : null}
      <button type="button" className="btn btn-primary" onClick={reset}>
        重试
      </button>
    </main>
  );
}
