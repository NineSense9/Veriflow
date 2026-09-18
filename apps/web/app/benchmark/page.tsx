"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { api, unwrapBench } from "@/lib/api";

type CaseRow = {
  gold?: string;
  fault?: string;
  difficulty?: string;
  category?: string;
  expected?: string;
  detected?: boolean;
  localized?: boolean;
  repaired?: boolean;
  repair_reason?: string;
  codes?: string[];
};

function fmt(value: unknown, digits = 3) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
  }
  return "—";
}

export default function BenchmarkPage() {
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const data = unwrapBench(raw);

  useEffect(() => {
    api
      .benchLatest()
      .then(setRaw)
      .catch((err: Error) => setError(err.message));
  }, []);

  const cases = useMemo(() => {
    const rows = Array.isArray(data?.cases) ? (data?.cases as CaseRow[]) : [];
    const query = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== "all" && (row.category || "") !== category) return false;
      if (!query) return true;
      return [row.fault, row.gold, row.expected, row.repair_reason, ...(row.codes || [])]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [data, q, category]);

  const failures = Array.isArray(data?.repair_failures) ? (data?.repair_failures as { gold?: string; fault?: string; reason?: string }[]) : [];
  const categories = Array.from(
    new Set((Array.isArray(data?.cases) ? (data?.cases as CaseRow[]) : []).map((row) => row.category).filter(Boolean)),
  ) as string[];

  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>基准评测</h1>
          <p className="lead">
            仓库内 gold IR 的故障注入，不是外部竞赛榜。n 小的时候禁止写成 SOTA。
          </p>
        </header>
        {error ? <p className="err">{error}</p> : null}
        {data && data.status !== "NOT RUN" ? (
          <>
            <dl className="vf-strip">
              <div>
                <dt>套件</dt>
                <dd>{String(data.suite ?? "—")}</dd>
              </div>
              <div>
                <dt>故障数</dt>
                <dd>{fmt(data.n, 0)}</dd>
              </div>
              <div>
                <dt>TP / FP / TN / FN</dt>
                <dd>
                  {fmt(data.tp, 0)}/{fmt(data.fp, 0)}/{fmt(data.tn, 0)}/{fmt(data.fn, 0)}
                </dd>
              </div>
              <div>
                <dt>F1</dt>
                <dd>{fmt(data.detection_f1)}</dd>
              </div>
              <div>
                <dt>修复率</dt>
                <dd>{fmt(data.repair_success_rate)}</dd>
              </div>
              <div>
                <dt>定位</dt>
                <dd>{fmt(data.fault_localization_accuracy)}</dd>
              </div>
            </dl>
            <p className="caption">
              源文件 {String(data.source || "—")} · clean {fmt(data.n_clean, 0)} · bases{" "}
              {fmt(data.base_workflow_count, 0)} · 复现 {String(data.reproduce || data.command || "python scripts/competition_benchmark.py")}
              · LLM-judge {String((data.llm_judge as { status?: string } | undefined)?.status || data.llm_judge_baseline || "NOT RUN")}
            </p>
            {data.ablation && typeof data.ablation === "object" ? (
              <section>
                <h2>Ablation（同一 dataset / seed）</h2>
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>模式</th>
                        <th>F1</th>
                        <th>召回</th>
                        <th>FP 率</th>
                        <th>TP/FN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.ablation as Record<string, Record<string, unknown>>).map(([mode, row]) => (
                        <tr key={mode}>
                          <td>{mode}</td>
                          <td>{fmt(row.detection_f1)}</td>
                          <td>{fmt(row.detection_recall)}</td>
                          <td>{fmt(row.false_positive_rate)}</td>
                          <td>
                            {fmt(row.tp, 0)}/{fmt(row.fn, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {data.baselines && typeof data.baselines === "object" ? (
              <section>
                <h2>对照</h2>
                <p className="caption">对照来自同一套 gold IR。LLM-as-judge 未跑时保持 NOT RUN，不填假分。</p>
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>对照</th>
                        <th>状态</th>
                        <th>F1 / 召回</th>
                        <th>修复率</th>
                        <th>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.baselines as Record<string, Record<string, unknown>>).map(([key, row]) => (
                        <tr key={key}>
                          <td>{String(row.label || key)}</td>
                          <td>{String(row.status || "—")}</td>
                          <td>
                            {fmt(row.detection_f1)} / {fmt(row.detection_recall)}
                          </td>
                          <td>{fmt(row.repair_success_rate)}</td>
                          <td className="caption">{String(row.note || row.reason || "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {failures.length ? (
              <section>
                <h2>修复失败</h2>
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>Gold</th>
                        <th>Fault</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((row, index) => (
                        <tr key={`${row.gold}-${row.fault}-${index}`}>
                          <td>{row.gold || "—"}</td>
                          <td>{row.fault || "—"}</td>
                          <td className="mono">{row.reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <p className="caption">当前 metrics 未列出 repair_failures，或本套件修复全部接受。</p>
            )}
            <section>
              <h2>用例</h2>
              <div className="filter-bar">
                <input
                  className="input"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="搜索 fault / gold / code"
                  aria-label="搜索用例"
                />
                <label>
                  Category
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="all">全部</option>
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fault</th>
                      <th>Cat</th>
                      <th>Diff</th>
                      <th>Detected</th>
                      <th>Localized</th>
                      <th>Repaired</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((row, index) => (
                      <tr key={`${row.fault}-${index}`}>
                        <td>{row.fault || "—"}</td>
                        <td>{row.category || "—"}</td>
                        <td>{row.difficulty || "—"}</td>
                        <td>{row.detected ? "Y" : "N"}</td>
                        <td>{row.localized ? "Y" : "N"}</td>
                        <td>{row.repaired ? "Y" : "N"}</td>
                        <td className="mono">{row.repair_reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : data ? (
          <div className="empty">
            <p>还没有 bench 文件。在仓库根目录运行 `python -m veriflow_cli bench --suite smoke`。</p>
          </div>
        ) : (
          <p className="ghost">读取 /api/bench/latest…</p>
        )}
      </main>
    </Shell>
  );
}
