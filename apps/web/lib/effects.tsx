"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PREFS, readPrefs, writePrefs, type EffectsLevel, type Prefs } from "@/lib/prefs";

type Ctx = {
  prefs: Prefs;
  effects: EffectsLevel;
  setPrefs: (next: Prefs | ((p: Prefs) => Prefs)) => void;
  patch: (partial: Partial<Prefs>) => void;
};

const EffectsContext = createContext<Ctx | null>(null);

function resolveEffects(stored: EffectsLevel, reduceMotion: boolean): EffectsLevel {
  if (reduceMotion && stored === "full") return "reduced";
  if (reduceMotion && stored === "balanced") return "reduced";
  return stored;
}

export function EffectsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [systemReduce, setSystemReduce] = useState(false);

  useEffect(() => {
    const next = readPrefs();
    setPrefsState(next);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReduce(mq.matches);
    const onMq = () => setSystemReduce(mq.matches);
    mq.addEventListener("change", onMq);
    const onPrefs = () => setPrefsState(readPrefs());
    window.addEventListener("vf-prefs", onPrefs);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("vf-prefs", onPrefs);
    };
  }, []);

  const effects = resolveEffects(prefs.effectsLevel, systemReduce);

  useEffect(() => {
    document.documentElement.dataset.effects = effects;
    document.documentElement.dataset.motion = effects === "full" || effects === "balanced" ? "full" : "reduce";
    document.documentElement.style.setProperty("--code-font-size", `${prefs.codeFontPx}px`);
  }, [effects, prefs.codeFontPx]);

  const value = useMemo<Ctx>(
    () => ({
      prefs,
      effects,
      setPrefs: (next) => {
        const resolved = typeof next === "function" ? next(prefs) : next;
        setPrefsState(resolved);
        writePrefs(resolved);
      },
      patch: (partial) => {
        const resolved = { ...prefs, ...partial };
        setPrefsState(resolved);
        writePrefs(resolved);
      },
    }),
    [effects, prefs],
  );

  return <EffectsContext.Provider value={value}>{children}</EffectsContext.Provider>;
}

export function useEffects() {
  const ctx = useContext(EffectsContext);
  if (!ctx) {
    return {
      prefs: DEFAULT_PREFS,
      effects: "full" as EffectsLevel,
      setPrefs: () => undefined,
      patch: () => undefined,
    };
  }
  return ctx;
}

export function effectsAllowBackground(level: EffectsLevel) {
  return level === "full" || level === "balanced";
}

export function effectsAllowPointer(level: EffectsLevel) {
  return level === "full";
}

export function effectsAllowScan(level: EffectsLevel) {
  return level === "full" || level === "balanced";
}
