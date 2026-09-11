"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { applyPrefs, DEFAULT_PREFS, readPrefs, writePrefs, type Prefs } from "@/lib/prefs";
import { api } from "@/lib/api";
import { DualPlane } from "@/components/AiRail";

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ai, setAi] = useState<{ configured?: boolean; model?: string; provider?: string }>({});
  const [sandbox, setSandbox] = useState("…");

  useEffect(() => {
    setTheme(readTheme());
    const next = readPrefs();
    setPrefs(next);
    applyPrefs(next);
    api
      .health()
      .then((h) => {
        setSandbox(h.sandbox);
        setAi(h.ai || {});
      })
      .catch(() => undefined);
  }, []);

  function patch(partial: Partial<Prefs>) {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    writePrefs(next);
  }

  return (
    <Shell>
      <main className="page">
        <header className="page-head">
          <p className="kicker">Control center</p>
          <h1>设置</h1>
          <p className="lead">外观与 AI 协助存在本机。判定与沙箱始终在服务器。API Key 不会下发到浏览器。</p>
        </header>
        <DualPlane
          ai={{ model: ai.model, configured: ai.configured }}
          proof={{ sandbox, gate: "deterministic", status: "authority" }}
        />

        <section className="setting-list">
          <div className="setting-row">
            <div>
              <h2>外观</h2>
              <p className="ghost">浅色默认。深色适合夜间。</p>
            </div>
            <div className="seg" role="group" aria-label="外观">
              <button
                type="button"
                className={theme === "light" ? "on" : ""}
                onClick={() => {
                  applyTheme("light");
                  setTheme("light");
                }}
              >
                浅色
              </button>
              <button
                type="button"
                className={theme === "dark" ? "on" : ""}
                onClick={() => {
                  applyTheme("dark");
                  setTheme("dark");
                }}
              >
                深色
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <h2>密度</h2>
              <p className="ghost">紧凑适合 1366 演示。</p>
            </div>
            <div className="seg">
              <button type="button" className={prefs.density === "comfortable" ? "on" : ""} onClick={() => patch({ density: "comfortable" })}>
                舒适
              </button>
              <button type="button" className={prefs.density === "compact" ? "on" : ""} onClick={() => patch({ density: "compact" })}>
                紧凑
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <h2>减少动效</h2>
              <p className="ghost">关闭导航指示条与列表进入动画。</p>
            </div>
            <button type="button" className={`btn ${prefs.reducedMotion ? "btn-primary" : ""}`} onClick={() => patch({ reducedMotion: !prefs.reducedMotion })}>
              {prefs.reducedMotion ? "已开启" : "关闭"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h2>显示技术细节</h2>
              <p className="ghost">算法 id、latency、hash。</p>
            </div>
            <button type="button" className={`btn ${prefs.showTechnical ? "btn-primary" : ""}`} onClick={() => patch({ showTechnical: !prefs.showTechnical })}>
              {prefs.showTechnical ? "显示" : "隐藏"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h2>AI Requirement Interpretation</h2>
              <p className="ghost">关闭后需求编译走 heuristic，不调用模型。模型仍不裁决 PASS/FAIL。</p>
            </div>
            <button type="button" className={`btn ${prefs.aiInterpret ? "btn-primary" : ""}`} onClick={() => patch({ aiInterpret: !prefs.aiInterpret })}>
              {prefs.aiInterpret ? "ON" : "OFF"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h2>AI Repair Proposal</h2>
              <p className="ghost">关闭后只使用规则候选。Guard 仍是确定性的。</p>
            </div>
            <button type="button" className={`btn ${prefs.aiRepair ? "btn-primary" : ""}`} onClick={() => patch({ aiRepair: !prefs.aiRepair })}>
              {prefs.aiRepair ? "ON" : "OFF"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h2>评测</h2>
              <p className="ghost">浏览器不判题。公网 sandbox 必须是 docker。</p>
            </div>
            <span className="mono">{sandbox}</span>
          </div>
        </section>
      </main>
    </Shell>
  );
}
