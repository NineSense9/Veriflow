"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { AlgorithmTable } from "@/components/VerificationConsole";
import ChromaGrid, { type ChromaItem } from "@/components/reactbits/ChromaGrid";
import { AlgorithmRecord, api } from "@/lib/api";
import { useEffects } from "@/lib/effects";

const PIPE = [
  "AI interprets",
  "verifier checks",
  "counterexample.minimize",
  "repair.selection",
  "repair.guard",
  "incremental.impact",
  "gate",
];

function chromaItem(algo: AlgorithmRecord): ChromaItem {
  const ai = algo.kind === "ai_assisted" || !algo.deterministic;
  const fail = /safety|secret|fail/i.test(algo.category + algo.algorithm_id);
  const warn = /repair|incremental/i.test(algo.category + algo.algorithm_id);
  const border = ai ? "#0f766e" : fail ? "#b42318" : warn ? "#b54708" : "#4b5563";
  return {
    title: algo.name,
    subtitle: algo.category,
    handle: algo.algorithm_id,
    location: algo.complexity || algo.kind,
    badge: algo.kind === "ai_assisted" ? "AI" : "DET",
    borderColor: border,
    gradient: `linear-gradient(145deg, ${border}, #111)`,
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
  useEffect(() => {
    api
      .algorithms()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);
  const items = useMemo(() => (data ? data.algorithms.map(chromaItem) : []), [data]);
  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>Algorithm Center</h1>
          <p className="lead">
            AI interprets → verifier checks → counterexample.minimize → repair.selection → repair.guard →
            incremental.impact → gate。表内算法与这条 pipeline 是同一份注册表。ChromaGrid 是 vendored React Bits，token 色不是彩虹。
          </p>
        </header>
        <ol className="algo-pipe">
          {PIPE.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {error ? <p className="err">{error}</p> : null}
        {data ? (
          <>
            <dl className="vf-strip">
              <div>
                <dt>Algorithms</dt>
                <dd>{data.count}</dd>
              </div>
              <div>
                <dt>Deterministic</dt>
                <dd>{data.deterministic}</dd>
              </div>
              <div>
                <dt>AI-assisted</dt>
                <dd>{data.ai_assisted}</dd>
              </div>
              <div>
                <dt>Tests</dt>
                <dd>pytest</dd>
              </div>
              <div>
                <dt>Benchmark</dt>
                <dd>{data.benchmark_version ? data.benchmark_version.slice(0, 19) : "NOT RUN"}</dd>
              </div>
            </dl>
            <ChromaGrid items={items} columns={3} radius={240} />
            {prefs.showTechnical ? <AlgorithmTable items={data.algorithms} /> : null}
          </>
        ) : (
          <p className="ghost">加载注册表…</p>
        )}
      </main>
    </Shell>
  );
}
