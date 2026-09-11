"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { type EffectsLevel, type Prefs } from "@/lib/prefs";
import { api } from "@/lib/api";
import { DualPlane } from "@/components/AiRail";
import { useEffects } from "@/lib/effects";
import ElasticSlider from "@/components/reactbits/ElasticSlider";

const LEVELS: { id: EffectsLevel; label: string; hint: string }[] = [
  { id: "full", label: "Full", hint: "backgrounds + pointer + scan + witness" },
  { id: "balanced", label: "Balanced", hint: "backgrounds dim; keep pipeline/witness" },
  { id: "reduced", label: "Reduced", hint: "no looping backgrounds; 150–180ms fades" },
  { id: "off", label: "Off", hint: "optional motion off; keep loading/focus/modal" },
];

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const { prefs, patch } = useEffects();
  const [ai, setAi] = useState<{ configured?: boolean; model?: string; provider?: string }>({});
  const [sandbox, setSandbox] = useState("…");

  useEffect(() => {
    setTheme(readTheme());
    api
      .health()
      .then((h) => {
        setSandbox(h.sandbox);
        setAi(h.ai || {});
      })
      .catch(() => undefined);
  }, []);

  function applyPreset(name: NonNullable<Prefs["preset"]>) {
    if (name === "demo") {
      patch({ preset: name, effectsLevel: "full", density: "comfortable", showTechnical: false, aiInterpret: true, aiRepair: true });
    } else if (name === "developer") {
      patch({ preset: name, effectsLevel: "balanced", density: "compact", showTechnical: true, showRawJson: true, aiInterpret: true, aiRepair: true });
    } else {
      patch({ preset: name, effectsLevel: "reduced", density: "compact", showTechnical: false, aiInterpret: false, aiRepair: false });
    }
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

        <section className="setting-list" id="settings-appearance">
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
        </section>

        <section className="setting-list" id="settings-effects">
          <div className="setting-row">
            <div>
              <h2>Effects Level</h2>
              <p className="ghost">replaces reduced-motion boolean. prefers-reduced-motion still forces Reduced.</p>
            </div>
            <div className="seg" role="group" aria-label="Effects level">
              {LEVELS.map((item) => (
                <button key={item.id} type="button" className={prefs.effectsLevel === item.id ? "on" : ""} onClick={() => patch({ effectsLevel: item.id, reducedMotion: item.id === "reduced" || item.id === "off" })}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <p className="caption">{LEVELS.find((item) => item.id === prefs.effectsLevel)?.hint}</p>
          <div className="setting-row">
            <div>
              <h2>Code font size</h2>
              <p className="ghost">ElasticSlider (vendored React Bits). Off still keeps this control.</p>
            </div>
            <ElasticSlider
              defaultValue={prefs.codeFontPx}
              startingValue={11}
              maxValue={20}
              isStepped
              stepSize={1}
              onChange={(value) => patch({ codeFontPx: Math.round(value) })}
              leftIcon={<span className="ghost">A</span>}
              rightIcon={<span>A</span>}
            />
          </div>
          <div className="setting-row">
            <div>
              <h2>Presets</h2>
              <p className="ghost">UX only. Does not change verifier semantics.</p>
            </div>
            <div className="seg" id="settings-lab">
              {(["demo", "developer", "minimal"] as const).map((name) => (
                <button key={name} type="button" className={prefs.preset === name ? "on" : ""} onClick={() => applyPreset(name)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="setting-list" id="settings-ai">
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
              <p className="ghost">关闭后需求编译走 heuristic，不调用模型。模型仍不裁决 PASS/FAIL。请求带 allow_ai。</p>
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
