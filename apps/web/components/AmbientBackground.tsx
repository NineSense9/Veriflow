"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { effectsAllowBackground, effectsAllowPointer, useEffects } from "@/lib/effects";
import { getAmbientActivity, subscribeAmbientActivity } from "@/lib/ambient-activity";
import { resolveAmbient } from "@/lib/route-ambient";
import { readTheme, type Theme } from "@/lib/theme";
import Scanner from "@/components/reactbits/Scanner";
import { useVisibleMotion } from "@/lib/use-visible-motion";

const FaultyTerminal = dynamic(() => import("@/components/reactbits/FaultyTerminal"), { ssr: false });
const LightRays = dynamic(() => import("@/components/reactbits/LightRays"), { ssr: false });
const Threads = dynamic(() => import("@/components/reactbits/Threads"), { ssr: false });
const Topography = dynamic(() => import("@/components/reactbits/Topography"), { ssr: false });
const FloatingLines = dynamic(() => import("@/components/reactbits/FloatingLines"), { ssr: false });
const RippleGrid = dynamic(() => import("@/components/reactbits/RippleGrid"), { ssr: false });

function useThemeNow(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const sync = () => setTheme(readTheme());
    sync();
    window.addEventListener("vf-theme", sync);
    return () => window.removeEventListener("vf-theme", sync);
  }, []);
  return theme;
}

function useActivity() {
  return useSyncExternalStore(subscribeAmbientActivity, getAmbientActivity, () => "idle" as const);
}

export default function AmbientBackground() {
  const pathname = usePathname() || "/";
  const { effects } = useEffects();
  const theme = useThemeNow();
  const activity = useActivity();
  const cfg = resolveAmbient(pathname);
  const { ref, visible } = useVisibleMotion();
  const allow = effectsAllowBackground(effects);
  const pointerOk = effectsAllowPointer(effects) && cfg.pointer;
  const reduced = effects === "reduced";
  const off = effects === "off";

  if (off || cfg.variant === "none" || !allow || !visible) {
    return <div ref={ref} className="ambient-host ambient-wash" aria-hidden="true" />;
  }

  const light = theme === "light";
  let intensity = cfg.intensity;
  if (cfg.variant === "scanner-field" && (activity === "running" || activity === "executing")) {
    intensity = Math.max(0.45, cfg.intensity * 3.2);
  }
  const layer = (
    <>
      {cfg.variant === "faulty-terminal" ? (
        <FaultyTerminal
          className="ambient-fill"
          lightMode={light}
          tint={light ? "#5f7a86" : "#2dd4bf"}
          brightness={light ? 0.42 : 0.28}
          scanlineIntensity={light ? 0.1 : 0.2}
          glitchAmount={pointerOk ? (light ? 0.12 : 0.28) : 0.04}
          flickerAmount={light ? 0.03 : 0.1}
          noiseAmp={light ? 0.2 : 0.3}
          chromaticAberration={0}
          curvature={0}
          mouseReact={pointerOk && !reduced}
          mouseStrength={effects === "balanced" ? 0.28 : 0.55}
          pause={reduced}
          pageLoadAnimation={!reduced}
          timeScale={reduced ? 0 : 0.22}
        />
      ) : null}
      {cfg.variant === "light-rays" ? (
        <LightRays className="ambient-fill" color={light ? "15, 118, 110" : "45, 212, 191"} />
      ) : null}
      {cfg.variant === "threads" ? (
        <Threads
          className="ambient-fill"
          color={light ? [15 / 255, 118 / 255, 110 / 255] : [45 / 255, 212 / 255, 191 / 255]}
          amplitude={0.75}
          enableMouseInteraction={pointerOk && !reduced}
        />
      ) : null}
      {cfg.variant === "topography" ? <Topography className="ambient-fill" /> : null}
      {cfg.variant === "floating-lines" ? (
        <FloatingLines className="ambient-fill" intensity={intensity} pointer={pointerOk && !reduced} />
      ) : null}
      {cfg.variant === "ripple-grid" ? (
        <RippleGrid className="ambient-fill" intensity={intensity} pointer={pointerOk && !reduced} />
      ) : null}
      {cfg.variant === "scanner-field" ? (
        <div className="ambient-fill" style={{ opacity: intensity, position: "relative" }}>
          <Scanner active={!reduced && (activity === "running" || activity === "executing")} />
        </div>
      ) : null}
      <div className="ambient-vignette" />
    </>
  );

  return (
    <div ref={ref} className={`ambient-host ambient-${cfg.variant}`} aria-hidden="true">
      {layer}
    </div>
  );
}
