"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { api, ComposeProject, VerifyIssue } from "@/lib/api";

const ComposeCanvas = dynamic(() => import("@/components/ComposeCanvas"), { ssr: false });

export default function ComposeProjectPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [project, setProject] = useState<ComposeProject | null>(null);
  const [nl, setNl] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<VerifyIssue | null>(null);

  function apply(next: ComposeProject) {
    setProject(next);
    setNl(next.source_nl);
    setSelected(next.verification?.issues[0] ?? null);
  }

  useEffect(() => {
    api.composeGet(id).then(apply).catch(() => setMessage("项目加载失败"));
  }, [id]);

  async function run(label: string, work: () => Promise<ComposeProject>) {
    setBusy(label);
    setMessage("");
    try {
      apply(await work());
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  const highlight = useMemo(() => {
    if (!selected) return undefined;
    return { nodes: selected.affected_nodes, path: selected.witness_path };
  }, [selected]);

  if (!project) {
    return (
      <Shell>
        <p className="page ghost">画布展开中…</p>
      </Shell>
    );
  }

  const verification = project.verification;
  const status = verification?.status ?? (project.errors.length ? "FAIL" : "PASS");

  return (
    <Shell>
      <div className="compose-desk">
        <div className="arena-top">
          <Link href="/compose" className="btn btn-ghost btn-sm">
            出题
          </Link>
          <span className="pid">#{project.id}</span>
          <h1>Verification Studio</h1>
          <span className={`verdict ${status === "PASS" ? "AC" : status === "WARNING" ? "TLE" : "WA"}`}>
            {status}
          </span>
          <span className="ghost">{verification ? `risk ${verification.risk_level}` : project.compiler}</span>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run("repair", () => api.composeRepair(id, nl))}
          >
            再编译
          </button>
          <button
            type="button"
            className="primary"
            disabled={Boolean(busy)}
            onClick={() => run("verify-repair", () => api.composeVerifyRepair(id))}
          >
            {busy === "verify-repair" ? "修复中" : "受约束修复"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || project.errors.length > 0}
            onClick={() => run("gate", () => api.composeGate(id, "approved"))}
          >
            审题通过
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={Boolean(busy)}
            onClick={() => run("gate", () => api.composeGate(id, "rejected"))}
          >
            驳回
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run("publish", () => api.composePublish(id))}
          >
            入库
          </button>
        </div>
        <label className="sr-only" htmlFor="compose-nl-edit">
          题意 / 规格
        </label>
        <textarea
          id="compose-nl-edit"
          className="compose-nl tight"
          rows={3}
          value={nl}
          onChange={(e) => setNl(e.target.value)}
        />
        <div className="compose-split">
          <section className="compose-canvas">
            {project.ir ? (
              <ComposeCanvas ir={project.ir} errors={project.errors} highlight={highlight} />
            ) : (
              <p className="ghost" style={{ padding: 16 }}>
                还没有 IR
              </p>
            )}
          </section>
          <aside className="side">
            <h2>规格覆盖</h2>
            <p className="caption">
              {verification
                ? `${verification.requirements_passed} / ${verification.requirements_total} 约束通过 · 置信 ${verification.confidence.toFixed(2)}`
                : "尚未验证"}
            </p>
            {verification?.dimensions.map((item) => (
              <div key={item.name} className="latest-line">
                <span className={`verdict ${item.status === "PASS" ? "AC" : "WA"}`}>{item.status}</span>
                <span>{item.name}</span>
                <span className="ghost">{item.issue_count}</span>
              </div>
            ))}
            <h2>Issues</h2>
            {verification?.issues.length ? (
              verification.issues.map((issue) => (
                <button
                  type="button"
                  key={issue.id}
                  className={`sample ${selected?.id === issue.id ? "fail" : ""}`}
                  onClick={() => setSelected(issue)}
                >
                  <span className={`verdict ${issue.severity === "CRITICAL" || issue.severity === "HIGH" ? "WA" : "TLE"}`}>
                    {issue.code}
                  </span>
                  <div>{issue.title}</div>
                </button>
              ))
            ) : (
              <p className="ghost">没有 Issue。</p>
            )}
            {selected ? (
              <>
                <h2>Inspector</h2>
                <p className="note">{selected.description}</p>
                <p className="caption">expected: {selected.expected ?? "—"}</p>
                <p className="caption">actual: {selected.actual ?? "—"}</p>
                {selected.witness_path.length ? (
                  <p className="caption">path: {selected.witness_path.join(" → ")}</p>
                ) : null}
                {selected.repair_hint ? <p className="caption">{selected.repair_hint}</p> : null}
              </>
            ) : null}
            {project.repair ? (
              <>
                <h2>Repair</h2>
                <p className="caption">
                  {project.repair.initial.status} → {project.repair.final.status} · {project.repair.iterations} 轮
                </p>
                {project.repair.steps.flatMap((step) =>
                  step.patches.map((patch, index) => (
                    <p className="caption" key={`${step.iteration}-${index}`}>
                      {patch.operation}
                      {patch.source && patch.target ? ` ${patch.source} → ${patch.target}` : ""}
                      {patch.reason ? ` · ${patch.reason}` : ""}
                    </p>
                  )),
                )}
              </>
            ) : null}
            <h2>弱测资攻击</h2>
            {project.attack.length === 0 ? (
              <p className="ghost">没有明显弱数据。</p>
            ) : (
              project.attack.map((item, index) => (
                <div className="sample" key={`${item.tag}-${index}`}>
                  <span className="verdict WA">{item.tag}</span>
                  <div>{item.message}</div>
                </div>
              ))
            )}
            <h2>审题门</h2>
            <p>
              {project.gate_status}
              {project.published_problem_id ? ` · 已入库 ${project.published_problem_id}` : ""}
            </p>
            {message ? <p className="err" role="alert">{message}</p> : null}
            {busy ? <p className="ghost">{busy}…</p> : null}
          </aside>
        </div>
      </div>
    </Shell>
  );
}
