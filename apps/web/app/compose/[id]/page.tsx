"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, ComposeProject } from "@/lib/api";

const ComposeCanvas = dynamic(() => import("@/components/ComposeCanvas"), { ssr: false });

export default function ComposeProjectPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [project, setProject] = useState<ComposeProject | null>(null);
  const [nl, setNl] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  function apply(next: ComposeProject) {
    setProject(next);
    setNl(next.source_nl);
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

  if (!project) {
    return (
      <Shell>
        <p className="page ghost">画布展开中…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="compose-desk">
        <div className="arena-top">
          <Link href="/compose">出题</Link>
          <span className="pid">#{project.id}</span>
          <h1>{project.status}</h1>
          <span className="ghost">{project.compiler}</span>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run("repair", () => api.composeRepair(id, nl))}
          >
            再编译
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
            disabled={Boolean(busy)}
            onClick={() => run("gate", () => api.composeGate(id, "rejected"))}
          >
            驳回
          </button>
          <button
            className="primary"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run("publish", () => api.composePublish(id))}
          >
            入库
          </button>
        </div>
        <textarea className="compose-nl tight" rows={3} value={nl} onChange={(e) => setNl(e.target.value)} />
        <div className="compose-split">
          <section className="compose-canvas">
            {project.ir ? (
              <ComposeCanvas ir={project.ir} errors={project.errors} />
            ) : (
              <p className="ghost">还没有 IR</p>
            )}
          </section>
          <aside className="side">
            <h2>静态检查</h2>
            {project.errors.length === 0 ? (
              <p className="ghost">编译期没有错误。</p>
            ) : (
              project.errors.map((error, index) => (
                <div className="sample" key={`${error.code}-${index}`}>
                  <span className="verdict CE">{error.code}</span>
                  <div>
                    {error.node_id ? `${error.node_id} · ` : ""}
                    {error.message}
                  </div>
                </div>
              ))
            )}
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
            {message ? <p className="ghost">{message}</p> : null}
            {busy ? <p className="ghost">{busy}…</p> : null}
          </aside>
        </div>
      </div>
    </Shell>
  );
}
