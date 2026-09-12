export type EffectsLevel = "full" | "balanced" | "reduced" | "off";

export type Prefs = {
  density: "comfortable" | "compact";
  effectsLevel: EffectsLevel;
  reducedMotion?: boolean;
  showTechnical: boolean;
  showRawJson: boolean;
  aiInterpret: boolean;
  aiRepair: boolean;
  defaultRuntime: boolean;
  codeFontPx: number;
  preset?: "demo" | "developer" | "minimal";
};

const KEY = "vf_prefs";

export const DEFAULT_PREFS: Prefs = {
  density: "comfortable",
  effectsLevel: "full",
  showTechnical: true,
  showRawJson: false,
  aiInterpret: true,
  aiRepair: true,
  defaultRuntime: true,
  codeFontPx: 14,
};

function migrate(raw: Record<string, unknown>): Prefs {
  const next = { ...DEFAULT_PREFS, ...raw } as Prefs;
  if (!next.effectsLevel) {
    next.effectsLevel = raw.reducedMotion === true ? "reduced" : "full";
  }
  if (typeof next.codeFontPx !== "number") next.codeFontPx = 14;
  return next;
}

export function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    return migrate(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: Prefs) {
  window.localStorage.setItem(KEY, JSON.stringify(prefs));
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.style.setProperty("--code-font-size", `${prefs.codeFontPx}px`);
  window.dispatchEvent(new Event("vf-prefs"));
}

export function applyPrefs(prefs: Prefs) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.style.setProperty("--code-font-size", `${prefs.codeFontPx}px`);
}
