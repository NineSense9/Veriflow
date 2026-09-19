"use client";

import { algorithmCopy } from "@/lib/algorithm-copy-zh";
import { categoryLabel } from "@/lib/ui-zh";

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
          <Link href="/algorithms">算法中心</Link>
        </p>
        {error ? <p className="err">{error}</p> : null}
        {item ? (
          <>
            <header className="page-head tight">
              <h1>{algorithmCopy(item.name)}</h1>
              <p className="lead">
                {item.algorithm_id} v{item.version} · {item.deterministic ? "确定性算法" : "AI 辅助"} · {categoryLabel(item.category)}
              </p>
            </header>
            <dl className="vf-kv">
              <div>
                <dt>解决的问题</dt>
                <dd>{algorithmCopy(item.description)}</dd>
              </div>
              <div>
                <dt>输入</dt>
                <dd>{item.inputs.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>输出</dt>
                <dd>{item.outputs.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>步骤</dt>
                <dd>{item.steps.map(algorithmCopy).join(" → ") || "—"}</dd>
              </div>
              <div>
                <dt>复杂度</dt>
                <dd>{algorithmCopy(item.complexity) || "—"}</dd>
              </div>
              <div>
                <dt>示例</dt>
                <dd>{algorithmCopy(item.example) || "—"}</dd>
              </div>
              <div>
                <dt>使用位置</dt>
                <dd>{item.used_by.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>测试</dt>
                <dd>{item.tests.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>基准结果</dt>
                <dd>{Object.keys(item.benchmark_metrics).length ? JSON.stringify(item.benchmark_metrics) : "暂无数据"}</dd>
              </div>
              <div>
                <dt>能力边界</dt>
                <dd>{algorithmCopy(item.limitations)}</dd>
              </div>
              <div>
                <dt>代码位置</dt>
                <dd>
                  <code>{item.code_location}</code>
                </dd>
              </div>
            </dl>
            {id === "graph.reachability" ? (
              <section>
                <h2>交互演示</h2>
                <p className="caption">五节点示例：a → b → c → d，e 为孤立节点。使用与验证接口一致的中间表示。</p>
                <label className="caption">
                  起点
                  <input value={source} onChange={(event) => setSource(event.target.value)} />
                </label>{" "}
                <label className="caption">
                  终点
                  <input value={target} onChange={(event) => setTarget(event.target.value)} />
                </label>{" "}
                <button type="button" className="btn btn-sm" onClick={() => runReach().catch((err) => setError(String(err)))}>
                  检查可达性
                </button>
              </section>
            ) : null}
            {id === "runtime.alignment" ? (
              <section>
                <h2>交互演示</h2>
                <label className="caption">
                  在此节点后截断
                  <input value={skip} onChange={(event) => setSkip(event.target.value)} />
                </label>{" "}
                <button type="button" className="btn btn-sm" onClick={() => runAlign().catch((err) => setError(String(err)))}>
                  检查轨迹对齐
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
