"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { effectsAllowBackground, useEffects } from "@/lib/effects";

export default function FadeContent({
  children,
  className = "",
  duration = 160,
}: {
  children: ReactNode;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const { effects } = useEffects();
  const animate = effectsAllowBackground(effects);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) { setShown(true); io.disconnect(); }
      },
      { threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown || !animate ? 1 : 0,
        transform: shown || !animate ? "none" : "translateY(8px)",
        transition: animate ? `opacity ${duration}ms ease, transform ${duration}ms ease` : "none",
      }}
    >
      {children}
    </div>
  );
}
