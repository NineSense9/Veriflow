"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type ComposeProject } from "@/lib/api";

export default function ProblemPackagePanel({ project, onProject }: { project: ComposeProject; onProject: (project: ComposeProject) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const metadata = project.problem_package;
  const locked = Boolean(project.published_problem_id);
  async function save(template = false) {
    setBusy(true); setError("");
    try {
      const input = template ? { template_id: "VF1012" } : JSON.parse(text);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("请输入完整题包对象。");
      onProject(await api.composePackage(project.id, input));
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="card" style={{ padding: 20, margin: "16px 0", minWidth: 0 }} aria-label="发布题包">
    <h2>发布题包</h2>
    <p>工作流通过检查后，还需验证实际题目。题包必须包含题面、输入输出、公开样例、隐藏测试和参考解。</p>
    <p role="status">{metadata?.ready ? `参考解已通过 ${metadata.validation?.tests_passed ?? 0} 条测试 · 可申请人工审核` : "尚无通过校验的题包，不能审核入库。"}</p>
    {metadata?.title ? <p><strong>{metadata.title}</strong> · 公开 {metadata.public_test_count} 条 · 隐藏 {metadata.hidden_test_count} 条<br />{metadata.provenance?.label}</p> : null}
    {locked ? (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: "color-mix(in srgb, var(--ac) 10%, var(--surface))", border: "1px solid color-mix(in srgb, var(--ac) 30%, transparent)", borderRadius: 6, margin: "8px 0" }}>
        <span>已发布为 <strong>{project.published_problem_id}</strong>。发布内容已锁定，题目已部署至竞赛题库。</span>
        <Link href={`/problems/${project.published_problem_id}`} className="btn btn-sm btn-primary" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>
          立即前往做题台挑战此题 →
        </Link>
      </div>
    ) : <details>
      <summary>导入或查看题包</summary>
      <p className="caption">JSON 字段：title、statement、input、output；public_tests 与 hidden_tests 均为至少一条包含 stdin、stdout 的列表；reference 包含 lang（python3 / cpp17）与 source；limits 包含 time_limit_ms、memory_limit_mb。</p>
      <label htmlFor="package-json">完整题包 JSON</label>
      <textarea id="package-json" className="input mono" rows={10} style={{ width: "100%", boxSizing: "border-box" }} value={text} onChange={event => setText(event.target.value)} disabled={busy} />
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => save()}>{busy ? "正在校验参考解…" : "校验并保存题包"}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>使用 VF1012 示例题包</button>
        {metadata?.title ? <button type="button" className="btn" disabled={busy} onClick={async () => {
          setError(""); setBusy(true);
          try { const result = await api.composePackageGet(project.id); setText(JSON.stringify(result.package, null, 2)); }
          catch (err) { setError((err as Error).message); }
          finally { setBusy(false); }
        }}>读取当前题包</button> : null}
      </div>
      <p className="caption">VF1012 是仓库中已有的「选课不冲突」示例，非本次 AI 生成。导入或修改题包后需要重新人工审核；隐藏测试和参考解仅草稿所有者可读取。</p>
    </details>}
    {project.repair_history?.length ? <details style={{ marginTop: 16 }}>
      <summary>已保存的修复历史（{project.repair_history.length}）</summary>
      {project.repair_history.map(item => <details key={item.id} style={{ margin: "12px 0" }}>
        <summary>修复 #{item.id} · {item.created_at} · {item.report.initial.status} → {item.report.final.status}</summary>
        <p>候选 {item.report.candidates_generated ?? 0} · 守卫拒绝 {item.report.candidates_rejected_guard ?? 0} · 完整复验 {item.report.candidates_fully_verified ?? 0}</p>
        <pre style={{ maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(item, null, 2)}</pre>
      </details>)}
    </details> : null}
    {error ? <p className="err" role="alert">{error}</p> : null}
  </section>;
}
