"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { AlgorithmRecord, api, WorkflowIR } from "@/lib/api";

const DEMO_IR: WorkflowIR = {
  ir_version: "1.0",
  domain: "compose",
  name: "reach_demo",
  nodes: [
    { id: "a", kind: "tool", tool: "test_generator" },
    { id: "b", kind: "guard", expr: "n<=1" },
    { id: "c", kind: "human_gate" },
    { id: "d", kind: "tool", tool: "publish_problem" },
    { id: "e", kind: "transform" },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d" },
  ],
};

export default function AlgorithmDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const [item, setItem] = useState<AlgorithmRecord | null>(null);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState("");
  const [source, setSource] = useState("a");
  const [target, setTarget] = useState("d");
  const [skip, setSkip] = useState("b");

  useEffect(() => {
    api
      .algorithm(id)
      .then(setItem)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  async function runReach() {
    const result = await api.algorithmTry("graph.reachability", { ir: DEMO_IR, source, target });
    setDemo(JSON.stringify(result));
  }

  async function runAlign() {
    const result = await api.algorithmTry("runtime.alignment", {
      ir: DEMO_IR,
      nl: "完整出题。",
      skip_after: skip,
    });
    setDemo(JSON.stringify(result));
  }

  return (
    <Shell>
      <main className="page vf-page">
        <p className="caption">
          <Link href="/algorithms">Algorithm Center</Link>
        </p>
        {error ? <p className="err">{error}</p> : null}
        {item ? (
          <>
            <header className="page-head tight">
              <h1>{item.name}</h1>
              <p className="lead">
                {item.algorithm_id} v{item.version} · {item.deterministic ? "Deterministic" : "AI-assisted"} · {item.category}
              </p>
            </header>
            <dl className="vf-kv">
              <div>
                <dt>Problem</dt>
                <dd>{item.description}</dd>
              </div>
              <div>
                <dt>Input</dt>
                <dd>{item.inputs.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{item.outputs.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Steps</dt>
                <dd>{item.steps.join(" → ") || "—"}</dd>
              </div>
              <div>
                <dt>Complexity</dt>
                <dd>{item.complexity || "—"}</dd>
              </div>
              <div>
                <dt>Example</dt>
                <dd>{item.example || "—"}</dd>
              </div>
              <div>
                <dt>Used by</dt>
                <dd>{item.used_by.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Tests</dt>
                <dd>{item.tests.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Benchmark</dt>
                <dd>{Object.keys(item.benchmark_metrics).length ? JSON.stringify(item.benchmark_metrics) : "N/A"}</dd>
              </div>
              <div>
                <dt>Limitations</dt>
                <dd>{item.limitations}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>
                  <code>{item.code_location}</code>
                </dd>
              </div>
            </dl>
            {id === "graph.reachability" ? (
              <section>
                <h2>Demo</h2>
                <p className="caption">5-node graph a→b→c→d, e orphan. Same IR the API uses.</p>
                <label className="caption">
                  from
                  <input value={source} onChange={(event) => setSource(event.target.value)} />
                </label>{" "}
                <label className="caption">
                  to
                  <input value={target} onChange={(event) => setTarget(event.target.value)} />
                </label>{" "}
                <button type="button" className="btn btn-sm" onClick={() => runReach().catch((err) => setError(String(err)))}>
                  Reachable?
                </button>
              </section>
            ) : null}
            {id === "runtime.alignment" ? (
              <section>
                <h2>Demo</h2>
                <label className="caption">
                  skip_after
                  <input value={skip} onChange={(event) => setSkip(event.target.value)} />
                </label>{" "}
                <button type="button" className="btn btn-sm" onClick={() => runAlign().catch((err) => setError(String(err)))}>
                  Align
                </button>
              </section>
            ) : null}
            {demo ? (
              <pre className="caption" style={{ whiteSpace: "pre-wrap" }}>
                {demo}
              </pre>
            ) : null}
          </>
        ) : (
          <p className="ghost">加载算法…</p>
        )}
      </main>
    </Shell>
  );
}
