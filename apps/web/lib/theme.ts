export type Theme = "light" | "dark";

export function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem("vf_theme") === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem("vf_theme", theme);
  window.dispatchEvent(new Event("vf-theme"));
}

export function toggleTheme(): Theme {
  const next: Theme = readTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
