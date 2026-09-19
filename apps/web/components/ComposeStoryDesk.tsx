"use client";

import { statusLabel } from "@/lib/ui-zh";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, ComposeProject } from "@/lib/api";
import { useEffects } from "@/lib/effects";
import {
  STORY_ACTS,
  StoryAct,
  dimName,
  gatePlain,
  gateReason,
  issueCodes,
  storyFindings,
  uniqueFindingTitles,
} from "@/lib/compose-story";

const ComposeCanvas = dynamic(() => import("@/components/ComposeCanvas"), { ssr: false });

export default function ComposeStoryDesk({
  project,
  onProject,
}: {
  project: ComposeProject;
  onProject: (next: ComposeProject) => void;
}) {
  const { prefs } = useEffects();
  const [act, setAct] = useState<StoryAct>("compose");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const repaired = Boolean(project.repair);
  const findings = useMemo(() => storyFindings(project), [project]);
  const failing = useMemo(
    () => (project.verification?.issues ?? []).flatMap((item) => item.affected_nodes || []),
    [project],
  );

  function canOpen(id: StoryAct) {
    if (id === "compose" || id === "check") return true;
    if (id === "repair") return true;
    return repaired;
  }

  async function repair() {
    setError("");
    setBusy("repair");
    setAct("repair");
    try {
      onProject(await api.composeVerifyRepair(project.id, prefs.aiRepair));
      setAct("compare");
    } catch (err) {
      setError((err as Error).message || "这次没修成。");
    } finally {
      setBusy("");
    }
  }

  const beforeCodes = project.repair ? (project.repair.initial.issues ?? []).map((item) => item.code) : issueCodes(project);
  const afterCodes = project.repair ? (project.repair.final.issues ?? []).map((item) => item.code) : issueCodes(project);
  const gone = beforeCodes.filter((code) => !afterCodes.includes(code));
  const stayed = afterCodes.filter((code) => beforeCodes.includes(code));
  const added = afterCodes.filter((code) => !beforeCodes.includes(code));

  return (
    <div className="vf-story-desk">
      <header className="vf-story-bar">
        <Link href="/compose?story=1" className="btn btn-ghost btn-sm">
          重新出题
        </Link>
        <ol className="vf-story-rail" aria-label="出题检查步骤">
          {STORY_ACTS.map((item, index) => (
            <li key={item.id} className={act === item.id ? "on" : undefined}>
              <button type="button" disabled={!canOpen(item.id)} onClick={() => setAct(item.id)}>
                <span>{index + 1}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </header>
      <div className="vf-story-split">
        <section className="vf-story-graph" aria-label="出题流程">
          {project.ir ? (
            <ComposeCanvas ir={project.ir} errors={project.errors} failing={failing} />
          ) : (
            <p className="ghost">还没有生成出题流程。</p>
          )}
        </section>
        <aside className="vf-story-panel">
          {act === "compose" ? (
            <>
              <p className="vf-home-kicker">出题</p>
              <h2>草案已经铺开。</h2>
              <p>按这句话生成的出题流程：</p>
              <blockquote>{project.source_nl}</blockquote>
              <p className="ghost">
                {project.ir
                  ? `${project.ir.nodes.length} 个步骤。下一步看检查过不过。`
                  : "没有生成流程。"}
              </p>
              <button className="btn btn-primary" type="button" onClick={() => setAct("check")}>
                看检查
              </button>
            </>
          ) : null}

          {act === "check" ? (
            <>
              <p className="vf-home-kicker">检查</p>
              <h2>{findings.length ? "这次没过。" : "检查没有列出问题。"}</h2>
              <p>
                发布门：{gatePlain(project.gate?.ready)}
                {project.errors.length ? ` · ${project.errors.length} 条静态问题` : ""}
              </p>
              {findings.length ? (
                <ul className="vf-story-findings">
                  {findings.map((item) => (
                    <li key={item.key}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ghost">没有需要修的项。仍以门禁为准，能不能进库要看验流。</p>
              )}
              <div className="vf-story-actions">
                <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={repair}>
                  {busy ? "正在修…" : "试着修一次"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setAct("compose")}>
                  回出题
                </button>
              </div>
            </>
          ) : null}

          {act === "repair" ? (
            <>
              <p className="vf-home-kicker">修复</p>
              <h2>{busy ? "正在提补丁、过守卫、再检查。" : repaired ? "修过一轮了。" : "还没开始修。"}</h2>
              {busy ? (
                <p className="vf-story-phase" role="status">
                  模型或规则可以提补丁，过不过由守卫和再检查说了算。
                </p>
              ) : null}
              {project.repair ? (
                <ul className="vf-story-findings">
                  <li>
                    <strong>补丁</strong>
                    <span>
                      {project.repair.candidates_generated ?? 0} 个提案 · 守卫挡下{" "}
                      {project.repair.candidates_rejected_guard ?? 0} 个 · 再检查通过{" "}
                      {project.repair.candidates_fully_verified ?? 0} 个
                    </span>
                  </li>
                  {project.repair.steps.flatMap((step) =>
                    step.patches.map((patch, index) => (
                      <li key={`${step.iteration}-${index}`}>
                        <strong>{patch.operation}</strong>
                        <span>
                          {patch.source && patch.target ? `${patch.source} → ${patch.target}` : ""}
                          {patch.reason ? ` ${patch.reason}` : ""}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              ) : !busy ? (
                <p className="ghost">点「试着修一次」才会提补丁。不会自动进库。</p>
              ) : null}
              <div className="vf-story-actions">
                {!repaired && !busy ? (
                  <button className="btn btn-primary" type="button" onClick={repair}>
                    试着修一次
                  </button>
                ) : null}
                {repaired ? (
                  <button className="btn btn-primary" type="button" onClick={() => setAct("compare")}>
                    看对比
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {act === "compare" ? (
            <>
              <p className="vf-home-kicker">对比</p>
              <h2>
                {project.repair
                  ? `${statusLabel(project.repair.initial.status)} → ${statusLabel(project.repair.final.status)}`
                  : "还没有修前修后。"}
              </h2>
              {project.repair ? (
                <ul className="vf-story-findings">
                  <li>
                    <strong>修好的</strong>
                    <span>{uniqueFindingTitles(gone).join("、") || "这一轮没有去掉问题"}</span>
                  </li>
                  <li>
                    <strong>还在的</strong>
                    <span>{uniqueFindingTitles(stayed).join("、") || "没有留下旧问题"}</span>
                  </li>
                  <li>
                    <strong>新出现的</strong>
                    <span>{uniqueFindingTitles(added).join("、") || "没有新问题"}</span>
                  </li>
                </ul>
              ) : (
                <p className="ghost">先修一轮再对比。</p>
              )}
              <button className="btn btn-primary" type="button" disabled={!repaired} onClick={() => setAct("flow")}>
                看验流
              </button>
            </>
          ) : null}

          {act === "flow" ? (
            <>
              <p className="vf-home-kicker">验流</p>
              <h2>{gatePlain(project.gate?.ready)}</h2>
              <p>整条检查看的是记录，不是模型自己说修好了。</p>
              <ul className="vf-story-findings">
                {(project.verification?.dimensions ?? []).map((item) => (
                  <li key={item.name}>
                    <strong>{dimName(item.name)}</strong>
                    <span>
                      {statusLabel(item.status)}
                      {item.issue_count ? ` · ${item.issue_count} 项` : ""}
                    </span>
                  </li>
                ))}
                {(project.gate?.reasons ?? []).map((reason) => (
                  <li key={reason}>
                    <strong>门禁</strong>
                    <span>{gateReason(reason)}</span>
                  </li>
                ))}
              </ul>
              {project.published_problem_id ? (
                <p>
                  已进题库{" "}
                  <Link href={`/problems/${project.published_problem_id}`}>{project.published_problem_id}</Link>
                </p>
              ) : project.gate?.ready === "READY" ? (
                <p className="ghost">检查过了。还没有入库，题库里还没有这道题。</p>
              ) : (
                <p className="ghost">这一题现在还不能进库。模型说修好了也不自动放行。</p>
              )}
              <div className="vf-story-actions">
                <Link className="btn" href={`/compose/${project.id}`}>
                  打开完整工坊
                </Link>
                <Link className="btn btn-ghost" href="/problems">
                  回题库
                </Link>
              </div>
            </>
          ) : null}

          {error ? (
            <p className="err" role="alert">
              {error}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
