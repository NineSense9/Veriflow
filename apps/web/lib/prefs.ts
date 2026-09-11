export type Prefs = {
  density: "comfortable" | "compact";
  reducedMotion: boolean;
  showTechnical: boolean;
  showRawJson: boolean;
  aiInterpret: boolean;
  aiRepair: boolean;
  defaultRuntime: boolean;
};

const KEY = "vf_prefs";

export const DEFAULT_PREFS: Prefs = {
  density: "comfortable",
  reducedMotion: false,
  showTechnical: true,
  showRawJson: false,
  aiInterpret: true,
  aiRepair: true,
  defaultRuntime: true,
};

export function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: Prefs) {
  window.localStorage.setItem(KEY, JSON.stringify(prefs));
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.dataset.motion = prefs.reducedMotion ? "reduce" : "full";
  window.dispatchEvent(new Event("vf-prefs"));
}

export function applyPrefs(prefs: Prefs) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.dataset.motion = prefs.reducedMotion ? "reduce" : "full";
}
