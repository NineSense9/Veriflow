"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import BrandAmbient from "@/components/BrandAmbient";
import { api, ComposeSummary } from "@/lib/api";
import { useEffects } from "@/lib/effects";
import styles from "../entry.module.css";

const EXAMPLES = [
  { name: "missing_gate", label: "缺少审题门", description: "观察没有人工审题步骤时，工作流如何被阻断。" },
  { name: "missing_bounds", label: "缺少范围守卫", description: "检查输入范围缺失对验证与测试的影响。" },
  { name: "valid_lis", label: "完整出题工作流", description: "从完整示例了解生成、检查、审题与入库。" },
];

function DraftStatus({ value }: { value: string }) {
  const labels: Record<string, string> = { blocked: "已阻断", published: "已入库", gated: "审题通过", ready: "待审题", draft: "草稿", pending: "待审题", approved: "已通过", rejected: "已驳回" };
  const statusTone = ["published", "gated", "approved"].includes(value) ? "AC" : ["blocked", "rejected"].includes(value) ? "WA" : "TLE";
  return <span className={`verdict ${statusTone}`} title={value}><i className="status-dot" aria-hidden="true" />{labels[value] || value}</span>;
}

export default function ComposeIndexPage() {
  const router = useRouter();
  const [nl, setNl] = useState("把题直接入库，不要审题门。");
  const [rows, setRows] = useState<ComposeSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { prefs } = useEffects();
  const [phase, setPhase] = useState("");
  const [lastAction, setLastAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoaded(false);
    setListError("");
    try {
      const data = await api.composeList();
      setRows(data.projects);
    } catch {
      setListError("草稿列表暂时无法加载，请重试。");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function compile(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !nl.trim()) return;
    setBusy(true);
    setError("");
    setLastAction(null);
    setPhase(prefs.aiInterpret ? "正在编译需求，生成工作流草稿…" : "正在按规则编译工作流草稿…");
    try {
      const project = await api.composeCreate(nl, prefs.aiInterpret);
      router.push(`/compose/${project.id}`);
    } catch (err) {
      setError((err as Error).message || "编译失败，请重试。");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  async function loadExample(name: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setLastAction(name);
    setPhase("正在从示例创建草稿…");
    try {
      const project = await api.composeExample(name);
      router.push(`/compose/${project.id}`);
    } catch (err) {
      setError((err as Error).message || "示例创建失败，请重试。");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  return (
    <Shell>
      <main className={`page wide ${styles.compose}`}>
        <header className={styles.composeHeader}>
          <BrandAmbient variant="lines" className={styles.headingAmbient} />
          <p className={styles.eyebrow}>01 / 从需求开始</p>
          <h1>描述需求，编译工作流。</h1>
          <p>把目标与约束写清楚，生成可检查、可修改的工作流草稿。</p>
        </header>

        <div className={styles.composeLayout}>
          <form className={styles.inputPanel} onSubmit={compile} aria-busy={busy}>
            <div className={styles.panelHeading}><h2>你的需求</h2><span className={styles.modeChip}>{prefs.aiInterpret ? "AI 辅助编译已开启" : "规则编译"}</span></div>
            <label className={styles.inputLabel} htmlFor="compose-nl">描述要生成的题目、工作步骤与限制条件</label>
            <textarea id="compose-nl" className={styles.requirementInput} rows={7} value={nl} onChange={(event) => setNl(event.target.value)} disabled={busy} required placeholder="例如：生成一道最长递增子序列题，约束输入规模，生成边界测试，通过审题后入库。" aria-describedby="compose-help" />
            <p id="compose-help" className={styles.inputHelp}>建议包含：题目目标、输入范围、测试要求、审题与入库条件。</p>
            <div className={styles.compileFooter}><span>编译后进入草稿，继续验证与修复。</span><button className="btn btn-primary" type="submit" disabled={busy || !nl.trim()}>{busy ? "处理中…" : "编译工作流"}<span aria-hidden="true">→</span></button></div>
            {busy ? <p className={styles.busyMessage} role="status">{phase}</p> : null}
            {error ? <div className={styles.inlineError} role="alert"><p>{error}</p><button className="btn btn-sm" type="button" disabled={busy} onClick={() => lastAction ? loadExample(lastAction) : compile()}>重试{lastAction ? "创建示例" : "编译"}</button></div> : null}
          </form>

          <aside className={styles.composeAside} aria-labelledby="examples-title">
            <div className={styles.asideIntro}><span className={styles.asideIndex}>需求 → 工作流 → 验证</span><h2 id="examples-title">从一个示例开始</h2><p>选择示例会创建一份新草稿，并打开工作流编辑页面。</p></div>
            <div className={styles.exampleList}>{EXAMPLES.map((item, index) => <button className={styles.exampleButton} key={item.name} type="button" disabled={busy} onClick={() => loadExample(item.name)}><span className={styles.caseNumber}>0{index + 1}</span><span><strong>{item.label}</strong><small>{item.description}</small></span><span aria-hidden="true">↗</span></button>)}</div>
            <p className={styles.verifierNote}><span aria-hidden="true">✓</span> 编译生成候选，验证器独立给出结论。</p>
          </aside>
        </div>

        <section className={styles.drafts} aria-labelledby="drafts-title">
          <div className={styles.panelHeading}><h2 id="drafts-title">工作流草稿 {loaded && !listError ? <span className={styles.count}>{rows.length}</span> : null}</h2><button className="btn btn-ghost btn-sm" onClick={refresh} disabled={!loaded}>刷新列表</button></div>
          {!loaded ? <p className={styles.quietState} role="status">正在读取草稿…</p> : listError ? <div className={styles.inlineError} role="alert"><p>{listError}</p><button className="btn btn-sm" type="button" onClick={refresh}>重新加载</button></div> : !rows.length ? <div className={styles.draftEmpty}><span aria-hidden="true">⌁</span><h3>还没有工作流草稿</h3><p>编译上方需求，或选择一个示例开始。</p></div> : (
            <div className={styles.draftTableWrap}><table className={`table ${styles.draftTable}`}><thead><tr><th className="num">编号</th><th>需求描述</th><th>草稿状态</th><th>审题状态</th><th>入库题目</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="num"><Link href={`/compose/${row.id}`}>#{row.id}</Link></td><td className={styles.draftDescription}><Link href={`/compose/${row.id}`}>{row.source_nl || "未命名需求"}</Link></td><td><DraftStatus value={row.status} /></td><td><DraftStatus value={row.gate_status} /></td><td>{row.published_problem_id ? <Link href={`/problems/${row.published_problem_id}`}>{row.published_problem_id}</Link> : <span className={styles.smallLabel}>未入库</span>}</td></tr>)}</tbody></table></div>
          )}
        </section>
      </main>
    </Shell>
  );
}
