"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Shell from "@/components/Shell";
import BrandAmbient from "@/components/BrandAmbient";
import { api } from "@/lib/api";
import { useEffects } from "@/lib/effects";
import { STORY_ACTS, STORY_NL } from "@/lib/compose-story";

export default function ComposeStoryStart() {
  const router = useRouter();
  const { prefs } = useEffects();
  const [nl, setNl] = useState(STORY_NL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy || !nl.trim()) return;
    setBusy(true);
    setError("");
    setPhase("正在生成出题流程…");
    try {
      let project =
        nl.trim() === STORY_NL
          ? await api.composeExample("missing_gate")
          : await api.composeCreate(nl, prefs.aiInterpret);
      if (!project.ir?.nodes?.length) {
        setPhase("这次没有生成出可用流程，改用规则草案…");
        project = await api.composeExample("missing_gate");
      }
      router.push(`/compose/${project.id}?story=1`);
    } catch (err) {
      setError((err as Error).message || "生成失败，请再试一次。");
      setBusy(false);
      setPhase("");
    }
  }

  return (
    <Shell>
      <main className="page wide vf-story">
        <ol className="vf-story-rail" aria-label="出题检查步骤">
          {STORY_ACTS.map((act, index) => (
            <li key={act.id} className={index === 0 ? "on" : undefined}>
              <span>{index + 1}</span>
              {act.label}
            </li>
          ))}
        </ol>
        <header className="vf-story-head">
          <BrandAmbient variant="lines" className="vf-story-ambient" />
          <p className="vf-home-kicker">出题</p>
          <h1>先出一道题，再看检查过不过。</h1>
          <p className="lead">
            下面是一句出题要求。生成的是出题流程，不是直接进题库。
          </p>
        </header>
        <form className="vf-story-form" onSubmit={start} aria-busy={busy}>
          <label htmlFor="story-nl">出题要求</label>
          <textarea
            id="story-nl"
            rows={4}
            value={nl}
            onChange={(event) => setNl(event.target.value)}
            disabled={busy}
            required
          />
          <div className="vf-story-actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !nl.trim()}>
              {busy ? "正在出题…" : "开始出题"}
            </button>
            <Link className="btn btn-ghost" href="/compose">
              普通出题
            </Link>
          </div>
          {phase ? (
            <p className="vf-story-phase" role="status">
              {phase}
            </p>
          ) : null}
          {error ? (
            <p className="err" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </main>
    </Shell>
  );
}
