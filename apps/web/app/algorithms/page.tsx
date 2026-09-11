"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { AlgorithmTable } from "@/components/VerificationConsole";
import { AlgorithmRecord, api } from "@/lib/api";

export default function AlgorithmsPage() {
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
  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>Algorithm Center</h1>
          <p className="lead">
            AI interprets → verifier checks → counterexample.minimize → repair.selection → repair.guard →
            incremental.impact → gate。表内算法与这条 pipeline 是同一份注册表。
          </p>
        </header>
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
            <AlgorithmTable items={data.algorithms} />
          </>
        ) : (
          <p className="ghost">加载注册表…</p>
        )}
      </main>
    </Shell>
  );
}
