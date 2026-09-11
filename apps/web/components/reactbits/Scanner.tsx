"use client";

import { useEffect, useRef } from "react";

export default function Scanner({
  active,
  className = "",
}: {
  active: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) % 1400) / 1400;
      el.style.setProperty("--scan", `${t * 100}%`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div
      ref={ref}
      className={`vf-scanner ${className}`}
      aria-hidden="true"
      data-active={active ? "1" : "0"}
      style={{
        pointerEvents: "none",
        opacity: active ? 1 : 0,
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        zIndex: 3,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 48,
          top: "var(--scan, 0%)",
          background: "linear-gradient(to bottom, transparent, rgba(15,118,110,0.28), transparent)",
        }}
      />
    </div>
  );
}
