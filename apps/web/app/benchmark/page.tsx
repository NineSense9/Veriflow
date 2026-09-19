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
  if (value === true) return "是";
  if (value === false) return "否";
  return "—";
}

const ABLATION_ORDER = ["structure-only", "no-safety", "no-runtime", "full"];
const LABELS: Record<string, string> = {
  clean: "正常", structural: "结构", semantic: "语义", ordering: "顺序", branch: "分支",
  dataflow: "数据流", parameter: "参数", safety: "安全", runtime: "运行时",
  linear_compose: "线性出题", merge_dual: "双路汇合", dataflow_typed: "类型化数据流",
  safety_env: "环境变量安全", branch_notify: "条件通知",
  orphan_node: "孤立节点", broken_edge: "断裂连线", missing_required_action: "缺少必要动作",
  wrong_order: "执行顺序错误", missing_branch: "缺少分支", broken_binding: "数据绑定错误",
  wrong_parameter: "参数错误", hardcoded_secret: "硬编码密钥", unsafe_webhook: "不安全的外发地址",
  runtime_skip_after_branch: "分支后执行中断", runtime_false_branch_missing_notify: "假分支遗漏通知",
  runtime_skip_after_notify: "通知后执行中断", runtime_skip_after_review: "审题后执行中断",
  runtime_skip_after_join: "汇合后执行中断",
  "structure-only": "仅结构检查", "no-safety": "关闭安全检查", "no-runtime": "仅静态验证", full: "完整验证",
  ok: "已完成", RAN: "已执行", FAILED: "执行失败", "NOT RUN": "未运行", PASS: "通过", FAIL: "未通过",
  accepted: "修复已接受", rejected: "修复被拒绝", "not applicable": "不适用",
  "DEEPSEEK_API_KEY unset": "未配置模型接口密钥", "all LLM calls failed": "全部模型请求失败",
  "no valid verdicts returned": "模型未返回有效判定",
  "runtime-only fault; static repair loop does not observe skip_after / branch choice": "仅运行时故障，静态修复无法观测执行中断或分支选择",
  deterministic_enumeration: "确定性枚举",
  "eventually notify": "最终应发送通知", "eventually publish_problem": "最终应发布题目",
  accept_without_verifier: "直接接受生成结果", deterministic_static: "确定性静态验证",
  veriflow_hybrid: "完整验证与受约束修复", llm_as_judge: "大模型判定对照",
};
const ABLATION_NOTES: Record<string, string> = {
  "structure-only": "仅保留结构检查，关闭语义、数据流、安全、可执行性检查及运行时监控。",
  "no-safety": "仅关闭安全检查，保留其他静态检查和运行时监控。",
  "no-runtime": "保留全部静态检查，关闭运行时监控。",
  full: "全部静态检查与运行时监控。",
};
function label(value: unknown) {
  const key = String(value ?? "");
  return LABELS[key] || key || "—";
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

  const allCases = useMemo(
    () => (Array.isArray(data?.cases) ? (data?.cases as CaseRow[]) : []),
    [data],
  );

  const cases = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allCases.filter((row) => {
      if (category !== "all" && (row.category || "") !== category) return false;
      if (!query) return true;
      return [row.fault, label(row.fault), row.gold, label(row.gold), label(row.category), row.expected, row.repair_reason, row.topology, ...(row.codes || [])]
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
  const llm = object(data?.llm_judge);
  const llmMetrics = object(llm.metrics);
  const llmReference = object(llm.reference_no_runtime);
  const hasStaticScope = llm.evaluation_scope === "static-only";
  const llmStatus = llm.status || data?.llm_judge_baseline || "NOT RUN";

  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight">
          <h1>基准评测</h1>
          <p className="lead">
            在仓库内的标准工作流上注入合成故障，按检测、诊断和修复分别评测。结果仅反映本用例集，不代表公开榜单成绩或业界领先水平。
          </p>
        </header>
        {error ? <p className="err">{error}</p> : null}
        {data && data.status !== "NOT RUN" ? (
          <>
            <dl className="vf-strip">
              <div>
                <dt>用例总数</dt>
                <dd>{fmt(data.total ?? (Number(data.n_clean || 0) + Number(data.n || 0)), 0)}</dd>
              </div>
              <div>
                <dt>正常用例</dt>
                <dd>{fmt(data.n_clean, 0)}</dd>
              </div>
              <div>
                <dt>故障用例</dt>
                <dd>{fmt(data.n_faulty ?? data.n, 0)}</dd>
              </div>
              <div>
                <dt>基础工作流 / 拓扑类型</dt>
                <dd>
                  {fmt(data.base_workflow_count, 0)} / {fmt(data.base_topology_count, 0)}
                </dd>
              </div>
              <div>
                <dt>检测 F1</dt>
                <dd>{fmt(data.detection_f1)}</dd>
              </div>
              <div>
                <dt>诊断准确率</dt>
                <dd>{fmt(data.diagnosis_accuracy)}</dd>
              </div>
            </dl>
            <p className="caption">
              数据集 {String(data.dataset || data.suite || "competition")} · 源文件 {String(data.source || "—")} · 运行时故障
              {fmt(data.runtime_fault_count, 0)} · 复现命令{" "}
              {String(data.reproduce || data.command || "python scripts/competition_benchmark.py")} · 枚举方式{" "}
              {label(data.sampling || "deterministic_enumeration")} · 大模型对照 {label(llmStatus)}
            </p>
            {ablationRows.length ? (
              <section>
                <h2>消融实验（同一数据集、同一用例顺序）</h2>
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>模式</th>
                        <th>验证范围</th>
                        <th>F1</th>
                        <th>召回</th>
                        <th>误报率</th>
                        <th>检出 / 漏检</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ablationRows.map(([mode, row]) => (
                        <tr key={mode}>
                          <td>{label(mode)}</td>
                          <td className="caption">{ABLATION_NOTES[mode]}</td>
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
                <p className="caption">确定性对照使用完整用例集。大模型仅评估可从输入观测的静态用例；其同范围对照见下方。未运行或没有有效响应时不展示分数。</p>
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
                          <td>{label(key)}</td>
                          <td>{label(row.status)}</td>
                          <td>
                            {fmt(key === "llm_as_judge" ? llmMetrics.effective_f1 : row.detection_f1)} / {fmt(key === "llm_as_judge" ? null : row.detection_recall)}
                          </td>
                          <td>{fmt(row.repair_success_rate)}</td>
                          <td className="caption">{key === "llm_as_judge" ? "仅静态子集，展示计入无有效判定的有效 F1；详见下方。" : key === "accept_without_verifier" ? "不执行验证，直接接受生成结果。" : key === "deterministic_static" ? "全部静态检查，不含运行时监控。" : "静态验证、运行时监控与受约束修复；增量提速尚未测量。"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            <section>
              <h2>大模型静态判定对照</h2>
              <p className="caption">状态：{label(llmStatus)}{llm.reason ? ` · ${label(llm.reason)}` : ""}。模型只接收需求和完整工作流，不接收执行轨迹；仅运行时故障不计入此项评测分母。</p>
              {hasStaticScope ? (
                <>
                  <p className="caption">评测范围：静态子集共 {fmt(llm.eligible_case_count, 0)} 例（正常 {fmt(llm.n_clean, 0)}、静态故障 {fmt(llm.n_faulty, 0)}）；排除运行时故障 {fmt(llm.excluded_runtime_case_count, 0)} 例。每例重复 {fmt(llm.repeats, 0)} 次。</p>
                  <dl className="vf-strip">
                    <div><dt>同子集静态验证 F1</dt><dd>{fmt(llmReference.detection_f1)}</dd></div>
                    <div><dt>模型有效响应 F1</dt><dd>{fmt(llmMetrics.valid_response_f1)}</dd></div>
                    <div><dt>模型有效 F1（计入失败）</dt><dd>{fmt(llmMetrics.effective_f1)}</dd></div>
                    <div><dt>有效判定 / 总调用</dt><dd>{fmt(llmMetrics.scored_calls, 0)} / {fmt(llmMetrics.attempted_calls, 0)}</dd></div>
                  </dl>
                  <p className="caption">有效响应 F1 仅统计成功解析的判定。有效 F1 将所有请求失败和解析失败按错误计分：故障用例计为漏检，正常用例计为误报。没有有效判定时，两项 F1 均留空。</p>
                  <p className="caption">请求成功 {fmt(llmMetrics.http_ok, 0)} · 请求失败 {fmt(llmMetrics.http_fail, 0)} · 解析失败 {fmt(llmMetrics.parse_failure_count, 0)}（占成功请求 {fmt(llmMetrics.parse_failure_rate)}）· 无有效判定 {fmt(llmMetrics.abstention_count, 0)} · 重复判定一致率 {fmt(llmMetrics.repeated_verdict_agreement)}（仅统计至少两次有效响应的用例）。</p>
                </>
              ) : (
                <p className="caption">当前保存的评测未记录静态子集口径与有效响应统计，不能据此比较模型分数。重新运行新版评测后可展示范围、分母和同范围静态对照；未运行的模型保持空值。</p>
              )}
            </section>
            <section>
              <h2>修复</h2>
              <p className="caption">
                适用 {fmt(data.repair_applicable_count, 0)} · 成功 {fmt(data.repair_success_count, 0)} · 失败{" "}
                {fmt(data.repair_failure_count, 0)} · 成功率 {fmt(data.repair_success_rate)}
                。仅运行时故障不计入静态修复的分母。
              </p>
              {failures.length ? (
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>基础工作流</th>
                        <th>故障</th>
                        <th>原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((row, index) => (
                        <tr key={`${row.gold}-${row.fault}-${index}`}>
                          <td>{label(row.gold)}</td>
                          <td>{label(row.fault)}</td>
                          <td className="mono">{label(row.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="caption">
                  {Number(data.repair_failure_count || 0) === 0 && Number(data.repair_applicable_count || 0) > 0
                    ? "适用的静态修复用例全部通过验收。"
                    : "没有适用的静态修复用例。"}
                </p>
              )}
            </section>
            <section>
              <h2>用例浏览</h2>
              <div className="filter-bar">
                <input
                  className="input"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="搜索故障、基础工作流或问题代码"
                  aria-label="搜索用例"
                />
                <label>
                  故障类别
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="all">全部</option>
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>基础工作流</th>
                      <th>故障</th>
                      <th>类别</th>
                      <th>预期问题代码 / 条件</th>
                      <th>已检出</th>
                      <th>诊断正确</th>
                      <th>定位正确</th>
                      <th>修复结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.length ? (
                      cases.map((row, index) => (
                        <tr key={`${row.gold}-${row.fault}-${index}`}>
                          <td title={row.gold}>{label(row.gold)}</td>
                          <td title={row.fault}>{label(row.fault)}</td>
                          <td>{label(row.category)}</td>
                          <td className="mono">{label(row.expected)}</td>
                          <td>{yn(row.detected)}</td>
                          <td>{yn(row.diagnosed)}</td>
                          <td>{yn(row.localized)}</td>
                          <td className="mono">
                            {row.repair_applicable === false ? "不适用" : yn(row.repaired)}
                            {row.repair_reason ? ` · ${label(row.repair_reason)}` : ""}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8}>没有符合条件的竞赛评测用例。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : data ? (
          <div className="empty">
            <p>还没有评测结果。在仓库根目录运行 <code>python scripts/competition_benchmark.py</code>。</p>
          </div>
        ) : (
          <p className="ghost">正在读取最新评测结果…</p>
        )}
      </main>
    </Shell>
  );
}
