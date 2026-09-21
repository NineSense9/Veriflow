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
  { id: "full", label: "完整", hint: "背景氛围、指针聚焦、扫描与反例轨迹动画" },
  { id: "balanced", label: "平衡", hint: "背景减弱，保留流水线与反例轨迹" },
  { id: "reduced", label: "减弱", hint: "无循环背景；短渐变" },
  { id: "off", label: "关闭", hint: "可选动效关闭；保留加载、焦点与对话框" },
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
          <p className="kicker">控制中心</p>
          <h1>设置</h1>
          <p className="lead">外观与 AI 协助存在本机。判定与沙箱始终在服务器。接口密钥不会下发到浏览器。</p>
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
              <h2>动效等级</h2>
              <p className="ghost">系统「减少动态效果」仍会强制降到减弱。</p>
            </div>
            <div className="seg" role="group" aria-label="动效等级">
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
              <h2>代码字号</h2>
              <p className="ghost">关闭动效时仍可调节。</p>
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
              <h2>预设</h2>
              <p className="ghost">只改界面，不改验证器语义。</p>
            </div>
            <div className="seg" id="settings-lab">
              {(["demo", "developer", "minimal"] as const).map((name) => (
                <button key={name} type="button" className={prefs.preset === name ? "on" : ""} onClick={() => applyPreset(name)}>
                  {name === "demo" ? "演示" : name === "developer" ? "开发" : "最小"}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="setting-list" id="settings-ai">
          <div className="setting-row">
            <div>
              <h2>显示技术细节</h2>
              <p className="ghost">算法编号、耗时和工作流指纹。</p>
            </div>
            <button type="button" className={`btn ${prefs.showTechnical ? "btn-primary" : ""}`} onClick={() => patch({ showTechnical: !prefs.showTechnical })}>
              {prefs.showTechnical ? "显示" : "隐藏"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h2>AI 需求解释</h2>
              <p className="ghost">关闭后需求编译走启发式，不调用模型。模型仍不裁决通过或失败。</p>
            </div>
            <button type="button" className={`btn ${prefs.aiInterpret ? "btn-primary" : ""}`} onClick={() => patch({ aiInterpret: !prefs.aiInterpret })}>
              {prefs.aiInterpret ? "开" : "关"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h2>AI 修复提案</h2>
              <p className="ghost">关闭后只使用规则候选。守卫仍是确定性的。</p>
            </div>
            <button type="button" className={`btn ${prefs.aiRepair ? "btn-primary" : ""}`} onClick={() => patch({ aiRepair: !prefs.aiRepair })}>
              {prefs.aiRepair ? "开" : "关"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h2>评测</h2>
              <p className="ghost">判题在服务器沙箱中执行，公网环境使用 Docker 隔离。</p>
            </div>
            <span className="mono">{sandbox}</span>
          </div>
        </section>
      </main>
    </Shell>
  );
}
