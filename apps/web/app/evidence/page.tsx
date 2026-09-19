"use client";

import { statusLabel, categoryLabel } from "@/lib/ui-zh";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import StatusChip from "@/components/StatusChip";
import { api, VerifySession } from "@/lib/api";
import { dimLabel } from "@/lib/status";
import { downloadSessionEvidence } from "@/lib/evidence-export";


type Clause = {
  id: string;
  text: string;
  kind: string;
  status: string;
  nodes: string[];
  verifier: string;
  evidence: string;
};

export default function EvidencePage() {
  const [session, setSession] = useState<VerifySession | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .reportHistory(1)
      .then(async (hist) => {
        if (hist.runs[0]) {
          setSession(await api.reportRun(hist.runs[0].id));
          return;
        }
        setSession(await api.reportSession({ demo: "case4_runtime" }));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const clauses = ((session as VerifySession & { traceability?: { clauses: Clause[] } })?.traceability?.clauses ?? []) as Clause[];
  const dims = session?.static.dimensions ?? [];

  return (
    <Shell>
      <main className="page vf-page">
        <header className="page-head tight evidence-cert">
          <p className="kicker">证据证书</p>
          <h1>证据证书</h1>
          <p className="lead">这是入库检查的依据：提案来源和最终判定分开记录。模型没有最终判定权。</p>
        </header>
        {error ? <p className="err">{error}</p> : null}
        {!session ? (
          <p className="ghost">读取最近验证记录…</p>
        ) : (
          <>
            <section className="vf-evidence-span">
              <h2>提案与判定</h2>
              <p className="caption">阶段 / 提案方 / 裁决方。</p>
              <div className="table-wrap vf-evidence-table-wrap">
                <table className="table tight">
                  <thead>
                    <tr>
                      <th>阶段</th>
                      <th>提案</th>
                      <th>判定</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>自然语言 → 中间表示</td>
                      <td>DeepSeek 或启发式（工作流提案）</td>
                      <td>不是裁决</td>
                    </tr>
                    <tr>
                      <td>规格</td>
                      <td>compile_spec 启发式</td>
                      <td>仅约束</td>
                    </tr>
                    <tr>
                      <td>验证</td>
                      <td>—</td>
                      <td>{statusLabel(session.status)} · 门禁 {statusLabel(session.gate.ready)}</td>
                    </tr>
                    <tr>
                      <td>修复</td>
                      <td>规则 / DeepSeek 候选</td>
                      <td>守卫 + 字典序选择</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            <dl className="vf-strip">
              <div>
                <dt>运行</dt>
                <dd>
                  <StatusChip value={session.status} />
                </dd>
              </div>
              <div>
                <dt>门禁</dt>
                <dd>
                  <StatusChip value={session.gate.ready} />
                </dd>
              </div>
              <div>
                <dt>工作流指纹</dt>
                <dd>{session.workflow_hash.slice(0, 12)}</dd>
              </div>
              <div>
                <dt>判定权</dt>
                <dd>验证器</dd>
              </div>
            </dl>
            <p className="caption">
              {session.cross.pattern} · {session.cross.story}
              {session.run_id ? ` · #${session.run_id}` : ""}
              {session.parent_run_id ? ` · 原始运行 #${session.parent_run_id}` : ""}
            </p>
            <p className="vf-home-more">
              <button type="button" className="btn btn-sm" onClick={() => downloadSessionEvidence(session, "json")}>
                导出 JSON
              </button>
              <button type="button" className="btn btn-sm" onClick={() => downloadSessionEvidence(session, "md")}>
                导出 Markdown
              </button>
            </p>
            <section>
              <h2>维度（验证器裁决）</h2>
              <ul className="vf-dim-grid">
                {dims.map((dim) => (
                  <li key={dim.name} className="vf-dim-card">
                    <span className="vf-dim-name">{dimLabel(dim.name)}</span>
                    <StatusChip value={dim.status} />
                    <span className="caption">{dim.issue_count} 个问题</span>
                  </li>
                ))}
                <li className="vf-dim-card">
                  <span className="vf-dim-name">运行时</span>
                  <StatusChip value={session.runtime?.status} />
                  <span className="caption">{(session.runtime_findings ?? session.runtime?.issues ?? []).length} 个问题</span>
                </li>
              </ul>
            </section>
            <section>
              <h2>需求覆盖</h2>
              {clauses.length ? (
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>条款</th>
                        <th>种类</th>
                        <th>状态</th>
                        <th>节点</th>
                        <th>验证器</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clauses.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.id} · {row.text}
                          </td>
                          <td>{categoryLabel(row.kind)}</td>
                          <td>
                            <StatusChip value={row.status} />
                          </td>
                          <td className="mono">{row.nodes.join(", ") || "—"}</td>
                          <td className="mono">{row.verifier || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="caption">这条历史记录未包含需求追溯数据。可前往验证页重新运行案例，生成新记录。</p>
              )}
            </section>
            <p>
              <Link className="btn" href={session.run_id ? `/report/runs/${session.run_id}` : "/report"}>
                打开完整验证
              </Link>
            </p>
          </>
        )}
      </main>
    </Shell>
  );
}
