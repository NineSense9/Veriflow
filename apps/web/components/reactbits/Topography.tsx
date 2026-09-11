"use client";

import { useEffect, useRef } from "react";
import { useEffects } from "@/lib/effects";

export default function Topography({
  className = "",
  opacity = 0.14,
}: {
  className?: string;
  opacity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { effects } = useEffects();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (effects === "off") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let start = performance.now();
    const drift = effects === "full" || effects === "balanced";
    const period = 16000;

    const paint = (phase: number) => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = "currentColor";
      ctx.lineWidth = 1;
      const levels = 8;
      for (let i = 1; i <= levels; i++) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 4) {
          const nx = x / 90;
          const y =
            height * (i / (levels + 1)) +
            Math.sin(nx + i * 0.7 + phase) * 18 +
            Math.sin(nx * 0.35 + i + phase * 0.6) * 22;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const tick = (now: number) => {
      const phase = ((now - start) / period) * Math.PI * 2;
      paint(phase);
      if (drift && !document.hidden) raf = requestAnimationFrame(tick);
    };

    if (drift) raf = requestAnimationFrame(tick);
    else paint(0);

    const ro = new ResizeObserver(() => {
      if (!drift) paint(0);
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [effects, opacity]);

  if (effects === "off") return null;
  return (
    <div ref={wrapRef} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
