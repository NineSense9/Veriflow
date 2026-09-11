"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <main style={{ padding: 32, fontFamily: "sans-serif" }}>
          <h1>VeriFlow 无法渲染</h1>
          <p>{error.message}</p>
          <button type="button" onClick={reset}>
            重试
          </button>
        </main>
      </body>
    </html>
  );
}
