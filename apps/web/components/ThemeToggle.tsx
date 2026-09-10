"use client";

import { toggleTheme, type Theme } from "@/lib/theme";

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M4.6 4.6l1.1 1.1M18.3 18.3l1.1 1.1M3 12h1.5M19.5 12H21M4.6 19.4l1.1-1.1M18.3 5.7l1.1-1.1" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z" />
    </svg>
  );
}

export default function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle?: (next: Theme) => void;
}) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      title={theme === "dark" ? "浅色" : "深色"}
      onClick={() => {
        const next = toggleTheme();
        onToggle?.(next);
      }}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}
