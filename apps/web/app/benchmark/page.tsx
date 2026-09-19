"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { api, unwrapBench } from "@/lib/api";

type CaseRow = {
  gold?: string;
  topology?: string;
  fault?: string;
  difficulty?: string;
  category?: string;
  expected?: string;
  detected?: boolean;
  diagnosed?: boolean;
  localized?: boolean;
  repaired?: boolean;
  repair_applicable?: boolean;
  repair_reason?: string;
  codes?: string[];
};

function fmt(value: unknown, digits = 3) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
  }
  return "—";
}

function yn(value: unknown) {
  if (value === true) return "Y";
  if (value === false) return "N";
  return "—";
}

const ABLATION_ORDER = ["structure-only", "no-safety", "no-runtime", "full"];

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

  const allCases = useMemo(
    () => (Array.isArray(data?.cases) ? (data?.cases as CaseRow[]) : []),
    [data],
  );

  const cases = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allCases.filter((row) => {
      if (category !== "all" && (row.category || "") !== category) return false;
      if (!query) return true;
      return [row.fault, row.gold, row.expected, row.repair_reason, row.topology, ...(row.codes || [])]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [allCases, q, category]);

  const failures = Array.isArray(data?.repair_failures)
    ? (data?.repair_failures as { gold?: string; fault?: string; reason?: string }[])
    : [];
  const categories = Array.from(new Set(allCases.map((row) => row.category).filter(Boolean))) as string[];
  const ablation =
    data?.ablation && typeof data.ablation === "object"
      ? (data.ablation as Record<string, Record<string, unknown>>)
      : {};
  const ablationRows = ABLATION_ORDER.filter((mode) => ablation[mode]).map((mode) => [mode, ablation[mode]] as const);

  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>基准评测</h1>
          <p className="lead">
            Synthetic mutation benchmark · 仓库内 gold IR 故障注入。不是公开榜，不是 SOTA。n
            必须和指标同屏出现。
          </p>
        </header>
        {error ? <p className="err">{error}</p> : null}
        {data && data.status !== "NOT RUN" ? (
          <>
            <dl className="vf-strip">
              <div>
                <dt>N total</dt>
                <dd>{fmt(data.total ?? (Number(data.n_clean || 0) + Number(data.n || 0)), 0)}</dd>
              </div>
              <div>
                <dt>clean</dt>
                <dd>{fmt(data.n_clean, 0)}</dd>
              </div>
              <div>
                <dt>faulty</dt>
                <dd>{fmt(data.n_faulty ?? data.n, 0)}</dd>
              </div>
              <div>
                <dt>base / topology</dt>
                <dd>
                  {fmt(data.base_workflow_count, 0)} / {fmt(data.base_topology_count, 0)}
                </dd>
              </div>
              <div>
                <dt>detection F1</dt>
                <dd>{fmt(data.detection_f1)}</dd>
              </div>
              <div>
                <dt>diagnosis</dt>
                <dd>{fmt(data.diagnosis_accuracy)}</dd>
              </div>
            </dl>
            <p className="caption">
              {String(data.dataset || data.suite || "competition")} · 源文件 {String(data.source || "—")} · runtime
              faults {fmt(data.runtime_fault_count, 0)} · 复现{" "}
              {String(data.reproduce || data.command || "python scripts/competition_benchmark.py")} · sampling{" "}
              {String(data.sampling || "deterministic_enumeration")} · LLM-judge{" "}
              {String((data.llm_judge as { status?: string } | undefined)?.status || data.llm_judge_baseline || "NOT RUN")}
            </p>
            {ablationRows.length ? (
              <section>
                <h2>Ablation（同一 dataset / 同一 case 顺序）</h2>
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>模式</th>
                        <th>关闭什么</th>
                        <th>F1</th>
                        <th>召回</th>
                        <th>FP 率</th>
                        <th>TP/FN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ablationRows.map(([mode, row]) => (
                        <tr key={mode}>
                          <td>{mode}</td>
                          <td className="caption">{String(row.closes || "—")}</td>
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
            <section>
              <h2>修复</h2>
              <p className="caption">
                适用 {fmt(data.repair_applicable_count, 0)} · 成功 {fmt(data.repair_success_count, 0)} · 失败{" "}
                {fmt(data.repair_failure_count, 0)} · 成功率 {fmt(data.repair_success_rate)}
                。runtime-only fault 不计入分母。
              </p>
              {failures.length ? (
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
              ) : (
                <p className="caption">
                  {Number(data.repair_failure_count || 0) === 0 && Number(data.repair_applicable_count || 0) > 0
                    ? "适用的 static repair case 全部被接受。"
                    : "没有适用的 static repair case。"}
                </p>
              )}
            </section>
            <section>
              <h2>Case Explorer</h2>
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
                      <th>Base</th>
                      <th>Fault</th>
                      <th>Category</th>
                      <th>Expected</th>
                      <th>Detected</th>
                      <th>Diagnosis</th>
                      <th>Localized</th>
                      <th>Repair</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.length ? (
                      cases.map((row, index) => (
                        <tr key={`${row.gold}-${row.fault}-${index}`}>
                          <td>{row.gold || "—"}</td>
                          <td>{row.fault || "—"}</td>
                          <td>{row.category || "—"}</td>
                          <td className="mono">{row.expected || "—"}</td>
                          <td>{yn(row.detected)}</td>
                          <td>{yn(row.diagnosed)}</td>
                          <td>{yn(row.localized)}</td>
                          <td className="mono">
                            {row.repair_applicable === false ? "n/a" : yn(row.repaired)}
                            {row.repair_reason ? ` · ${row.repair_reason}` : ""}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8}>没有可显示的 competition cases。确认 experiments/runs/competition/cases.json 已生成。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : data ? (
          <div className="empty">
            <p>还没有 bench 文件。在仓库根目录运行 `python scripts/competition_benchmark.py`。</p>
          </div>
        ) : (
          <p className="ghost">读取 /api/bench/latest…</p>
        )}
      </main>
    </Shell>
  );
}
