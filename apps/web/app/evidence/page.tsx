"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import StatusChip from "@/components/StatusChip";
import { api, VerifySession } from "@/lib/api";
import { dimLabel } from "@/lib/status";
import Topography from "@/components/reactbits/Topography";

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
        <header className="page-head tight">
          <p className="kicker">Evidence Certificate</p>
          <h1>证据证书</h1>
          <p className="lead">
            AI proposes. VeriFlow proves. 本页只展示 verifier / runtime / gate 的记录。模型没有最终判定权。
          </p>
        </header>
        {error ? <p className="err">{error}</p> : null}
        {!session ? (
          <p className="ghost">读取最近 run…</p>
        ) : (
          <>
            <div className="evidence-topo" aria-hidden="true">
              <Topography opacity={0.12} />
            </div>
            <section>
              <h2>Proposal vs Decision</h2>
              <p className="caption">Kill “Deterministic: yes”. 左边是提案来源，右边是 verifier 裁决。</p>
              <div className="table-wrap">
                <table className="table tight">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Proposal</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>NL → IR</td>
                      <td>DeepSeek or heuristic (WorkflowIR proposal)</td>
                      <td>not a verdict</td>
                    </tr>
                    <tr>
                      <td>Spec</td>
                      <td>compile_spec heuristic</td>
                      <td>constraints only</td>
                    </tr>
                    <tr>
                      <td>Verify</td>
                      <td>—</td>
                      <td>{session.status} · gate {session.gate.ready}</td>
                    </tr>
                    <tr>
                      <td>Repair</td>
                      <td>rule / deepseek candidates</td>
                      <td>Guard + lex selection</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            <dl className="vf-strip">
              <div>
                <dt>Run</dt>
                <dd>
                  <StatusChip value={session.status} />
                </dd>
              </div>
              <div>
                <dt>Gate</dt>
                <dd>
                  <StatusChip value={session.gate.ready} />
                </dd>
              </div>
              <div>
                <dt>Hash</dt>
                <dd>{session.workflow_hash.slice(0, 12)}</dd>
              </div>
              <div>
                <dt>Authority</dt>
                <dd>verifier</dd>
              </div>
            </dl>
            <p className="caption">
              {session.cross.pattern} · {session.cross.story}
              {session.run_id ? ` · #${session.run_id}` : ""}
              {session.parent_run_id ? ` · parent #${session.parent_run_id}` : ""}
            </p>
            <section>
              <h2>维度（verifier 裁决）</h2>
              <ul className="action-list">
                {dims.map((dim) => (
                  <li key={dim.name}>
                    <StatusChip value={dim.status} /> {dimLabel(dim.name)} · issues {dim.issue_count}
                  </li>
                ))}
                <li>
                  <StatusChip value={session.runtime?.status} /> 运行时模拟
                </li>
              </ul>
            </section>
            <section>
              <h2>Requirement Coverage</h2>
              {clauses.length ? (
                <div className="table-wrap">
                  <table className="table tight">
                    <thead>
                      <tr>
                        <th>Clause</th>
                        <th>Kind</th>
                        <th>Status</th>
                        <th>Nodes</th>
                        <th>Verifier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clauses.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.id} · {row.text}
                          </td>
                          <td>{row.kind}</td>
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
                <p className="caption">本 run 未带 traceability 字段时，打开验证页会写入新 session。</p>
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
