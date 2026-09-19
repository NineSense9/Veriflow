"use client";

import { algorithmCopy } from "@/lib/algorithm-copy-zh";
import { categoryLabel } from "@/lib/ui-zh";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { AlgorithmTable } from "@/components/VerificationConsole";
import ChromaGrid, { type ChromaItem } from "@/components/reactbits/ChromaGrid";
import { AlgorithmRecord, api } from "@/lib/api";
import { useEffects } from "@/lib/effects";

const PIPE = [
  "AI 解释",
  "验证器检查",
  "反例最小化",
  "修复选择",
  "补丁守卫",
  "增量影响",
  "发布门禁",
];

function chromaItem(algo: AlgorithmRecord): ChromaItem {
  const ai = algo.kind === "ai_assisted" || !algo.deterministic;
  const border = ai ? "var(--accent)" : /repair|incremental/i.test(algo.algorithm_id) ? "var(--warning)" : "var(--info)";
  return {
    title: algorithmCopy(algo.name),
    subtitle: categoryLabel(algo.category),
    handle: algo.algorithm_id,
    location: algorithmCopy(algo.complexity) || categoryLabel(algo.kind),
    badge: algo.kind === "ai_assisted" ? "AI 辅助" : "确定性",
    borderColor: border,
    url: `/algorithms/${encodeURIComponent(algo.algorithm_id)}`,
  };
}

export default function AlgorithmsPage() {
  const { prefs } = useEffects();
  const [data, setData] = useState<{
    algorithms: AlgorithmRecord[];
    count: number;
    deterministic: number;
    ai_assisted: number;
    benchmark_version: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setError("");
    api
      .algorithms()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [retry]);
  const items = useMemo(() => (data ? data.algorithms.map(chromaItem) : []), [data]);
  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>算法中心</h1>
          <p className="lead">
            AI 解释 → 验证器检查 → 反例最小化 → 修复选择 → 补丁守卫 → 增量影响 → 发布门禁。注册表与验证器共用。
          </p>
        </header>
        <ol className="algo-pipe">
          {PIPE.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {error ? <p className="err" role="alert">算法注册表加载失败。<button className="btn btn-sm" onClick={() => setRetry(n => n+1)}>重试</button></p> : null}
        {data ? (
          <>
            <dl className="vf-strip">
              <div>
                <dt>算法</dt>
                <dd>{data.count}</dd>
              </div>
              <div>
                <dt>确定性</dt>
                <dd>{data.deterministic}</dd>
              </div>
              <div>
                <dt>AI 辅助</dt>
                <dd>{data.ai_assisted}</dd>
              </div>
              <div>
                <dt>测试</dt>
                <dd>pytest</dd>
              </div>
              <div>
                <dt>基准</dt>
                <dd>{data.benchmark_version ? data.benchmark_version.slice(0, 19) : "未运行"}</dd>
              </div>
            </dl>
            <ChromaGrid items={items} columns={3} radius={240} />
            {prefs.showTechnical ? <AlgorithmTable items={data.algorithms} /> : null}
          </>
        ) : !error ? (
          <p className="ghost">加载注册表…</p>
        ) : null}
      </main>
    </Shell>
  );
}
