export type AmbientActivity = "idle" | "executing" | "running";

let activity: AmbientActivity = "idle";
const listeners = new Set<() => void>();

export function getAmbientActivity(): AmbientActivity {
  return activity;
}

export function setAmbientActivity(next: AmbientActivity) {
  if (activity === next) return;
  activity = next;
  listeners.forEach((fn) => fn());
}

export function subscribeAmbientActivity(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("vf-ambient-activity", (event: Event) => {
    const next = (event as CustomEvent).detail;
    if (next === "idle" || next === "executing" || next === "running") setAmbientActivity(next);
  });
}
