"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { effectsAllowBackground, effectsAllowPointer, useEffects } from "@/lib/effects";
import { readTheme, type Theme } from "@/lib/theme";

const FaultyTerminal = dynamic(() => import("@/components/reactbits/FaultyTerminal"), { ssr: false });
const LightRays = dynamic(() => import("@/components/reactbits/LightRays"), { ssr: false });

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

export default function AmbientBackground() {
  const pathname = usePathname();
  const { effects } = useEffects();
  const theme = useThemeNow();
  const route = pathname || "/";
  const isLogin = route.startsWith("/login");
  const isHome = route === "/";
  const allow = effectsAllowBackground(effects);
  const pointer = effectsAllowPointer(effects);
  const reduced = effects === "reduced";
  const off = effects === "off";

  if (off) return <div className="ambient-host ambient-wash" aria-hidden="true" />;
  if (!isLogin && !isHome) return null;

  if (isLogin) {
    if (!allow) return <div className="ambient-host ambient-wash" aria-hidden="true" />;
    return (
      <div className="ambient-host" aria-hidden="true">
        <LightRays className="ambient-fill" color={theme === "dark" ? "45, 212, 191" : "15, 118, 110"} />
        <div className="ambient-vignette" />
      </div>
    );
  }

  const light = theme === "light";
  const pause = reduced;
  const tint = light ? "#5f7a86" : "#2dd4bf";
  return (
    <div className="ambient-host" aria-hidden="true">
      <FaultyTerminal
        className="ambient-fill"
        lightMode={light}
        tint={tint}
        brightness={light ? 0.42 : 0.28}
        scanlineIntensity={light ? 0.08 : 0.18}
        glitchAmount={light ? 0.04 : 0.22}
        flickerAmount={light ? 0.02 : 0.08}
        noiseAmp={light ? 0.18 : 0.28}
        chromaticAberration={0}
        curvature={0}
        mouseReact={pointer && !pause}
        mouseStrength={effects === "balanced" ? 0.08 : 0.18}
        pause={pause}
        pageLoadAnimation={!pause}
        timeScale={pause ? 0 : 0.22}
      />
      <div className="ambient-vignette" />
    </div>
  );
}
