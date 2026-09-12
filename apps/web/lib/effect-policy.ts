import type { EffectsLevel } from "./prefs";

export function resolveEffects(stored: EffectsLevel, reduceMotion: boolean): EffectsLevel {
  return reduceMotion && (stored === "full" || stored === "balanced") ? "reduced" : stored;
}

export function effectsAllowBackground(level: EffectsLevel) {
  return level === "full" || level === "balanced";
}

export function effectsAllowPointer(level: EffectsLevel) {
  return level === "full";
}

export const effectsAllowScan = effectsAllowBackground;
